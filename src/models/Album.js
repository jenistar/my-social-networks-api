import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

// Règle 2.5 : un album photo est associé à 1 événement.
const albumSchema = new mongoose.Schema(
  {
    event: { type: ObjectId, ref: 'Event', required: true },
    name: { type: String, required: [true, 'Le nom de l\'album est obligatoire'], trim: true, maxlength: 150 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    createdBy: { type: ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, versionKey: false },
);

albumSchema.index({ event: 1, createdAt: -1 });

export const Album = mongoose.model('Album', albumSchema);
