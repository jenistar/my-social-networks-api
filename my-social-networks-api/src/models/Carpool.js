import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const integer = (label) => ({ validator: Number.isInteger, message: `${label} doit être un nombre entier` });

// Bonus (partie 3) : un utilisateur indique qu'il se rend à l'événement en voiture.
const carpoolSchema = new mongoose.Schema(
  {
    event: { type: ObjectId, ref: 'Event', required: true },
    driver: { type: ObjectId, ref: 'User', required: true },
    departureLocation: { type: String, required: [true, 'Le lieu de départ est obligatoire'], trim: true, maxlength: 300 },
    departureTime: { type: Date, required: [true, 'L\'heure de départ est obligatoire'] },
    price: { type: Number, required: [true, 'Le prix proposé est obligatoire'], min: [0, 'Le prix ne peut pas être négatif'] },
    availableSeats: {
      type: Number,
      required: [true, 'Le nombre de places disponibles est obligatoire'],
      min: [1, 'Il faut au moins 1 place disponible'],
      max: [8, 'Une voiture ne peut pas proposer plus de 8 places'],
      validate: integer('Le nombre de places'),
    },
    // Temps maximum d'écart accepté par le conducteur, en minutes.
    // Exemple : trajet de 2h30 avec 30 minutes d'écart, soit un trajet maximum de 3h.
    maxDetourMinutes: {
      type: Number,
      required: [true, 'Le temps maximum d\'écart est obligatoire'],
      min: [0, 'Le temps d\'écart ne peut pas être négatif'],
      validate: integer('Le temps d\'écart'),
    },
  },
  { timestamps: true, versionKey: false },
);

// Un utilisateur ne propose qu'un seul covoiturage par événement.
carpoolSchema.index({ event: 1, driver: 1 }, { unique: true });

export const Carpool = mongoose.model('Carpool', carpoolSchema);
