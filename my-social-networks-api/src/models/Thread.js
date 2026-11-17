import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const threadSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, 'Le titre du fil de discussion est obligatoire'], trim: true, maxlength: 150 },
    group: { type: ObjectId, ref: 'Group', default: null },
    event: { type: ObjectId, ref: 'Event', default: null },
    createdBy: { type: ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, versionKey: false },
);

threadSchema.index({ group: 1 });
threadSchema.index({ event: 1 });

// Règle 2.4 : un fil est lié à 1 groupe ou à 1 événement, mais pas aux deux.
threadSchema.pre('validate', function checkSingleParent() {
  if (Boolean(this.group) === Boolean(this.event)) {
    this.invalidate('group', 'Un fil de discussion doit être lié à un groupe ou à un événement, mais pas aux deux');
  }
});

export const Thread = mongoose.model('Thread', threadSchema);
