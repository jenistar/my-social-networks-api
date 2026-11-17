import {
  createAlbum,
  createPhoto,
  deleteAlbum,
  deletePhoto,
  getAlbum,
  getPhoto,
  listAlbums,
  listPhotos,
  updateAlbum,
  updatePhoto,
} from '../controllers/albums.controller.js';
import { createComment, listComments } from '../controllers/comments.controller.js';
import { createRouter } from './router.js';

const router = createRouter();

router.post('/events/:eventId/albums', createAlbum);
router.get('/events/:eventId/albums', listAlbums);
router.get('/albums/:id', getAlbum);
router.put('/albums/:id', updateAlbum);
router.delete('/albums/:id', deleteAlbum);

router.post('/albums/:id/photos', createPhoto);
router.get('/albums/:id/photos', listPhotos);
router.get('/photos/:id', getPhoto);
router.put('/photos/:id', updatePhoto);
router.delete('/photos/:id', deletePhoto);

router.get('/photos/:id/comments', listComments('Photo'));
router.post('/photos/:id/comments', createComment('Photo'));

export default router;
