import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

// Règle 2.4 : un fil de discussion contient 0 ou plusieurs messages.
const messageSchema = new mongoose.Schema(
  {
    thread: { type: ObjectId, ref: 'Thread', required: true },
    author: { type: ObjectId, ref: 'User', required: true },
    content: { type: String, required: [true, 'Le contenu du message est obligatoire'], trim: true, maxlength: 5000 },
  },
  { timestamps: true, versionKey: false },
);

messageSchema.index({ thread: 1, createdAt: -1 });

export const Message = mongoose.model('Message', messageSchema);
