import mongoose from 'mongoose';
import { normalizeKey } from '../utils/helpers.js';

const { ObjectId } = mongoose.Schema.Types;

// Règle 2.8 : ce qu'un utilisateur apporte à l'événement.
const shoppingItemSchema = new mongoose.Schema(
  {
    event: { type: ObjectId, ref: 'Event', required: true },
    user: { type: ObjectId, ref: 'User', required: true },
    name: { type: String, required: [true, 'Le nom de l\'élément est obligatoire'], trim: true, maxlength: 100 },
    quantity: {
      type: Number,
      required: [true, 'La quantité est obligatoire'],
      min: [1, 'La quantité doit être d\'au moins 1'],
      validate: { validator: Number.isInteger, message: 'La quantité doit être un nombre entier' },
    },
    arrivalTime: { type: Date, required: [true, 'L\'heure d\'arrivée est obligatoire'] },
    // Nom normalisé (sans accents ni majuscules) utilisé pour la règle d'unicité.
    nameKey: { type: String, select: false },
  },
  { timestamps: true, versionKey: false },
);

// Règle 2.8 : chaque chose apportée doit être unique par événement.
shoppingItemSchema.index({ event: 1, nameKey: 1 }, { unique: true });

shoppingItemSchema.pre('validate', function computeNameKey() {
  this.nameKey = normalizeKey(this.name);
});

shoppingItemSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.nameKey;
    return ret;
  },
});

export const ShoppingItem = mongoose.model('ShoppingItem', shoppingItemSchema);
