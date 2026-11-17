import mongoose from 'mongoose';
import { normalizeKey } from '../utils/helpers.js';

const { ObjectId } = mongoose.Schema.Types;

const required = (label) => [true, `${label} est obligatoire`];

// Règle 2.7 : pour chaque billet acheté, on définit le type de billet, les données
// de la personne (nom, prénom, adresse complète) et la date d'achat.
const ticketSchema = new mongoose.Schema(
  {
    event: { type: ObjectId, ref: 'Event', required: true },
    ticketType: { type: ObjectId, ref: 'TicketType', required: true },
    lastName: { type: String, required: required('Le nom'), trim: true, maxlength: 50 },
    firstName: { type: String, required: required('Le prénom'), trim: true, maxlength: 50 },
    address: {
      street: { type: String, required: required('La rue'), trim: true, maxlength: 200 },
      postalCode: { type: String, required: required('Le code postal'), trim: true, maxlength: 20 },
      city: { type: String, required: required('La ville'), trim: true, maxlength: 100 },
      country: { type: String, required: required('Le pays'), trim: true, maxlength: 100 },
    },
    purchasedAt: { type: Date, default: Date.now },
    // Clé calculée à partir du nom, du prénom et de l'adresse.
    // Elle permet de garantir qu'une personne n'obtient qu'un seul billet par événement.
    buyerKey: { type: String, select: false },
  },
  { timestamps: true, versionKey: false },
);

ticketSchema.index({ event: 1, buyerKey: 1 }, { unique: true });
ticketSchema.index({ ticketType: 1 });

ticketSchema.pre('validate', function computeBuyerKey() {
  const { street, postalCode, city, country } = this.address || {};
  this.buyerKey = normalizeKey(this.lastName, this.firstName, street, postalCode, city, country);
});

ticketSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.buyerKey;
    return ret;
  },
});

export const Ticket = mongoose.model('Ticket', ticketSchema);
