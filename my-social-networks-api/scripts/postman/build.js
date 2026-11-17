// Moteur de génération de la documentation Postman.
// Il exécute chaque requête du catalogue sur une vraie instance de l'API
// et enregistre la réponse obtenue comme exemple. La documentation ne peut donc
// pas montrer une réponse que l'API ne renvoie pas réellement.

const STATUS_TEXT = {
  200: 'OK',
  201: 'Created',
  204: 'No Content',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
};

const TOKEN_VARIABLE = { user: 'token', other: 'otherToken', temp: 'tempToken' };

// Remplace les variables {{nom}} par leur valeur, comme le fait Postman.
function resolve(text, variables) {
  return text.replace(/\{\{([^}]+)\}\}/g, (match, name) => {
    if (name === '$timestamp') return String(Math.floor(Date.now() / 1000));
    if (variables[name] === undefined) throw new Error(`Variable {{${name}}} utilisée avant d'être définie`);
    return variables[name];
  });
}

const readPath = (json, path) => new Function('json', `return json.${path};`)(json);

const rawBody = (body) => (body === undefined ? undefined : JSON.stringify(body, null, 2));

function buildUrl(path, query = []) {
  const active = query.filter((param) => !param.disabled);
  const search = active.length ? `?${active.map((param) => `${param.key}=${param.value}`).join('&')}` : '';
  return {
    raw: `{{baseUrl}}${path}${search}`,
    host: ['{{baseUrl}}'],
    path: path.split('/').filter(Boolean),
    ...(query.length ? { query: query.map(({ key, value, description, disabled }) => ({ key, value, description, ...(disabled ? { disabled: true } : {}) })) } : {}),
  };
}

function buildAuth(auth) {
  if (auth === 'user') return undefined; // Hérite de l'authentification de la collection.
  if (auth === 'none') return { type: 'noauth' };
  return { type: 'bearer', bearer: [{ key: 'token', value: `{{${TOKEN_VARIABLE[auth]}}}`, type: 'string' }] };
}

function buildRequest({ method, path, query, body, auth = 'user', description }) {
  const request = {
    method,
    header: body === undefined ? [] : [{ key: 'Content-Type', value: 'application/json' }],
    url: buildUrl(path, query),
  };
  const postmanAuth = buildAuth(auth);
  if (postmanAuth) request.auth = postmanAuth;
  if (body !== undefined) request.body = { mode: 'raw', raw: rawBody(body), options: { raw: { language: 'json' } } };
  if (description) request.description = description;
  return request;
}

function buildTestScript({ expect, save = {} }) {
  const lines = [`pm.test("Statut ${expect}", () => pm.response.to.have.status(${expect}));`];
  const entries = Object.entries(save);
  if (entries.length) {
    lines.push('', '// Enregistre les valeurs utiles aux requêtes suivantes.', 'const json = pm.response.json();');
    for (const [name, path] of entries) lines.push(`pm.collectionVariables.set("${name}", json.${path});`);
  }
  return { listen: 'test', script: { type: 'text/javascript', exec: lines } };
}

export async function buildCollection({ baseUrl, info, variables: declared, folders }) {
  const variables = { baseUrl };

  // Envoie réellement une requête à l'API, avec les variables remplacées.
  async function send({ method, path, query = [], body, auth = 'user' }) {
    const url = resolve(buildUrl(path, query).raw, variables);
    const headers = {};
    if (auth !== 'none') headers.Authorization = `Bearer ${resolve(`{{${TOKEN_VARIABLE[auth]}}}`, variables)}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : resolve(rawBody(body), variables),
    });
    const text = await response.text();
    return { status: response.status, json: text ? JSON.parse(text) : null };
  }

  // Appel caché, utilisé pour préparer des données. Il n'apparaît pas dans la collection.
  const call = async (method, path, { body, auth } = {}) => {
    const result = await send({ method, path, body, auth });
    if (result.status >= 400) throw new Error(`Préparation ${method} ${path} : ${result.status} ${JSON.stringify(result.json)}`);
    return result.json;
  };

  // Les tokens JWT des exemples sont masqués : la documentation publiée ne contient aucun token utilisable.
  const maskTokens = (text) => text.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.<données>.<signature>');

  function example(name, request, result) {
    return {
      name,
      originalRequest: request,
      status: STATUS_TEXT[result.status] ?? String(result.status),
      code: result.status,
      _postman_previewlanguage: 'json',
      header: result.json ? [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }] : [],
      cookie: [],
      body: result.json ? maskTokens(JSON.stringify(result.json, null, 2)) : '',
    };
  }

  const items = [];
  const reference = [];
  let count = 0;

  for (const folder of folders) {
    if (folder.setup) await folder.setup(call, variables);
    const folderItems = [];
    const rows = [];

    for (const definition of folder.requests) {
      const { name, expect, save, setup, prerequest, errors = [], success = 'Succès' } = definition;
      if (setup) await setup(call, variables);

      const result = await send(definition);
      if (result.status !== expect) {
        throw new Error(`${folder.name} / ${name} : attendu ${expect}, reçu ${result.status} ${JSON.stringify(result.json)}`);
      }
      for (const [variable, path] of Object.entries(save ?? {})) {
        variables[variable] = readPath(result.json, path);
        if (variables[variable] === undefined) throw new Error(`${name} : impossible de lire ${path} dans la réponse`);
      }

      const request = buildRequest(definition);
      const responses = [example(`${expect} ${success}`, request, result)];

      // Exemples d'erreurs : ils montrent les règles du cahier des charges appliquées par l'API.
      for (const error of errors) {
        if (error.setup) await error.setup(call, variables);
        const variant = { ...definition, ...error, description: undefined };
        const errorResult = await send(variant);
        if (error.teardown) await error.teardown(call, variables);
        if (errorResult.status !== error.expect) {
          throw new Error(`${folder.name} / ${name} / ${error.name} : attendu ${error.expect}, reçu ${errorResult.status} ${JSON.stringify(errorResult.json)}`);
        }
        responses.push(example(`${error.expect} ${error.name}`, buildRequest(variant), errorResult));
      }

      const events = [buildTestScript(definition)];
      if (prerequest) events.unshift({ listen: 'prerequest', script: { type: 'text/javascript', exec: prerequest.split('\n') } });

      folderItems.push({ name, event: events, request, response: responses });
      rows.push({ name, method: definition.method, path: definition.path, access: definition.access, summary: definition.summary });
      count += 1;
    }

    items.push({ name: folder.name, description: folder.description, item: folderItems });
    reference.push({ name: folder.name, description: folder.description, rows });
  }

  const collection = {
    info: {
      name: info.name,
      description: info.description,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] },
    variable: declared.map(([key, value, description]) => ({ key, value, type: 'string', description })),
    item: items,
  };

  return { collection, reference, count };
}
