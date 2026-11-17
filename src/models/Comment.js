import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

// Un commentaire porte soit sur un message (règle 2.4), soit sur une photo (règle 2.5).
const commentSchema = new mongoose.Schema(
  {
    targetType: { type: String, enum: ['Message', 'Photo'], required: true },
    target: { type: ObjectId, refPath: 'targetType', required: true },
    author: { type: ObjectId, ref: 'User', required: true },
    content: { type: String, required: [true, 'Le contenu du commentaire est obligatoire'], trim: true, maxlength: 2000 },
  },
  { timestamps: true, versionKey: false },
);

commentSchema.index({ targetType: 1, target: 1, createdAt: 1 });

export const Comment = mongoose.model('Comment', commentSchema);
