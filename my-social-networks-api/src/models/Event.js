import mongoose from 'mongoose';
import { httpUrlValidator } from '../utils/helpers.js';

const { ObjectId } = mongoose.Schema.Types;

const eventSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Le nom de l\'événement est obligatoire'], trim: true, maxlength: 150 },
    description: { type: String, trim: true, maxlength: 5000, default: '' },
    startDate: { type: Date, required: [true, 'La date de début est obligatoire'] },
    endDate: { type: Date, required: [true, 'La date de fin est obligatoire'] },
    location: { type: String, required: [true, 'Le lieu est obligatoire'], trim: true, maxlength: 300 },
    coverPhoto: { type: String, trim: true, maxlength: 2048, default: null, validate: httpUrlValidator },
    visibility: {
      type: String,
      enum: { values: ['public', 'private'], message: 'La visibilité doit être "public" ou "private"' },
      default: 'private',
    },
    // Règle 2.2 : un événement est géré par 1 ou plusieurs organisateurs.
    organizers: {
      type: [{ type: ObjectId, ref: 'User' }],
      validate: { validator: (list) => list.length >= 1, message: 'Un événement doit avoir au moins un organisateur' },
    },
    // Règle 2.2 : un événement peut avoir une multitude de participants.
    participants: [{ type: ObjectId, ref: 'User' }],
    // Groupe dans lequel l'événement a été créé (facultatif).
    group: { type: ObjectId, ref: 'Group', default: null },
    shoppingListEnabled: { type: Boolean, default: false },
    carpoolingEnabled: { type: Boolean, default: false },
    createdBy: { type: ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, versionKey: false },
);

eventSchema.index({ visibility: 1, startDate: 1 });
eventSchema.index({ organizers: 1 });
eventSchema.index({ participants: 1 });
eventSchema.index({ group: 1 });

eventSchema.pre('validate', function normalizeEvent() {
  // Pas de doublon, et un organisateur n'apparaît pas aussi dans les participants.
  const organizers = [...new Set(this.organizers.map(String))];
  const participants = [...new Set(this.participants.map(String))].filter((id) => !organizers.includes(id));
  if (organizers.length !== this.organizers.length) this.organizers = organizers;
  if (participants.length !== this.participants.length) this.participants = participants;

  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    this.invalidate('endDate', 'La date de fin doit être postérieure ou égale à la date de début');
  }
});

export const Event = mongoose.model('Event', eventSchema);
