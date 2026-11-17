import mongoose from 'mongoose';
import { httpUrlValidator } from '../utils/helpers.js';

const { ObjectId } = mongoose.Schema.Types;

// Règle 2.5 : chaque photo est postée par 1 participant de l'événement.
const photoSchema = new mongoose.Schema(
  {
    album: { type: ObjectId, ref: 'Album', required: true },
    event: { type: ObjectId, ref: 'Event', required: true },
    author: { type: ObjectId, ref: 'User', required: true },
    url: {
      type: String,
      required: [true, 'L\'URL de la photo est obligatoire'],
      trim: true,
      maxlength: 2048,
      validate: httpUrlValidator,
    },
    caption: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { timestamps: true, versionKey: false },
);

photoSchema.index({ album: 1, createdAt: -1 });
photoSchema.index({ event: 1 });

export const Photo = mongoose.model('Photo', photoSchema);
