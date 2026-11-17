import mongoose from 'mongoose';
import { httpUrlValidator } from '../utils/helpers.js';

const { ObjectId } = mongoose.Schema.Types;

const groupSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Le nom du groupe est obligatoire'], trim: true, maxlength: 150 },
    description: { type: String, trim: true, maxlength: 5000, default: '' },
    icon: { type: String, trim: true, maxlength: 2048, default: null, validate: httpUrlValidator },
    coverPhoto: { type: String, trim: true, maxlength: 2048, default: null, validate: httpUrlValidator },
    type: {
      type: String,
      enum: { values: ['public', 'private', 'secret'], message: 'Le type doit être "public", "private" ou "secret"' },
      default: 'private',
    },
    allowMembersToPost: { type: Boolean, default: true },
    allowMembersToCreateEvents: { type: Boolean, default: false },
    // Règle 2.3 : un groupe possède 1 ou plusieurs membres.
    members: {
      type: [{ type: ObjectId, ref: 'User' }],
      validate: { validator: (list) => list.length >= 1, message: 'Un groupe doit avoir au moins un membre' },
    },
    // Règle 2.3 : un groupe est géré par 1 ou plusieurs administrateurs.
    admins: {
      type: [{ type: ObjectId, ref: 'User' }],
      validate: { validator: (list) => list.length >= 1, message: 'Un groupe doit avoir au moins un administrateur' },
    },
    createdBy: { type: ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, versionKey: false },
);

groupSchema.index({ type: 1, name: 1 });
groupSchema.index({ members: 1 });

groupSchema.pre('validate', function normalizeGroup() {
  // Pas de doublon, et un administrateur est toujours aussi membre du groupe.
  const admins = [...new Set(this.admins.map(String))];
  const members = [...new Set([...this.members.map(String), ...admins])];
  if (admins.length !== this.admins.length) this.admins = admins;
  if (members.length !== this.members.length) this.members = members;
});

export const Group = mongoose.model('Group', groupSchema);
