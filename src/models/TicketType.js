import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

// Règle 2.7 : un type de billet contient un nom, un montant et une quantité limitée.
const ticketTypeSchema = new mongoose.Schema(
  {
    event: { type: ObjectId, ref: 'Event', required: true },
    name: { type: String, required: [true, 'Le nom du type de billet est obligatoire'], trim: true, maxlength: 100 },
    amount: {
      type: Number,
      required: [true, 'Le montant est obligatoire'],
      min: [0, 'Le montant ne peut pas être négatif'],
    },
    quantity: {
      type: Number,
      required: [true, 'La quantité de billets est obligatoire'],
      min: [1, 'La quantité doit être d\'au moins 1 billet'],
      validate: { validator: Number.isInteger, message: 'La quantité doit être un nombre entier' },
    },
    // Nombre de billets déjà vendus pour ce type.
    sold: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, versionKey: false },
);

ticketTypeSchema.index({ event: 1, name: 1 }, { unique: true });

export const TicketType = mongoose.model('TicketType', ticketTypeSchema);
