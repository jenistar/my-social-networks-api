import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const answerSchema = new mongoose.Schema({
  text: { type: String, required: [true, 'Le texte de la réponse est obligatoire'], trim: true, maxlength: 300 },
});

// Règle 2.6 : pour chaque question, il existe plusieurs réponses possibles.
const questionSchema = new mongoose.Schema({
  text: { type: String, required: [true, 'Le texte de la question est obligatoire'], trim: true, maxlength: 500 },
  answers: {
    type: [answerSchema],
    validate: {
      validator: (list) => list.length >= 2,
      message: 'Chaque question doit proposer au moins deux réponses possibles',
    },
  },
});

const pollSchema = new mongoose.Schema(
  {
    event: { type: ObjectId, ref: 'Event', required: true },
    title: { type: String, required: [true, 'Le titre du sondage est obligatoire'], trim: true, maxlength: 200 },
    // Règle 2.6 : un sondage comporte 1 ou plusieurs questions.
    questions: {
      type: [questionSchema],
      validate: { validator: (list) => list.length >= 1, message: 'Un sondage doit comporter au moins une question' },
    },
    createdBy: { type: ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, versionKey: false },
);

pollSchema.index({ event: 1, createdAt: -1 });

export const Poll = mongoose.model('Poll', pollSchema);
