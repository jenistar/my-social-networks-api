import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

// Réponse d'un participant à un sondage : une seule réponse choisie par question.
const pollResponseSchema = new mongoose.Schema(
  {
    poll: { type: ObjectId, ref: 'Poll', required: true },
    event: { type: ObjectId, ref: 'Event', required: true },
    user: { type: ObjectId, ref: 'User', required: true },
    answers: [
      {
        _id: false,
        question: { type: ObjectId, required: true },
        answer: { type: ObjectId, required: true },
      },
    ],
  },
  { timestamps: true, versionKey: false },
);

// Un participant ne répond qu'une seule fois à un sondage (il peut ensuite modifier sa réponse).
pollResponseSchema.index({ poll: 1, user: 1 }, { unique: true });

export const PollResponse = mongoose.model('PollResponse', pollResponseSchema);
