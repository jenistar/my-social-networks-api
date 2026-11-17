import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { httpUrlValidator } from '../utils/helpers.js';

// Champs visibles par les autres utilisateurs. L'email et le téléphone restent privés.
export const USER_PUBLIC_FIELDS = 'firstName lastName avatar city bio';

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: [true, 'Le prénom est obligatoire'], trim: true, maxlength: 50 },
    lastName: { type: String, required: [true, 'Le nom est obligatoire'], trim: true, maxlength: 50 },
    email: {
      type: String,
      required: [true, 'L\'email est obligatoire'],
      unique: true, // Règle 2.1 : pas deux utilisateurs avec le même email.
      lowercase: true,
      trim: true,
      maxlength: 254,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'L\'email n\'est pas valide'],
    },
    password: {
      type: String,
      required: [true, 'Le mot de passe est obligatoire'],
      minlength: [8, 'Le mot de passe doit contenir au moins 8 caractères'],
      maxlength: [72, 'Le mot de passe ne peut pas dépasser 72 caractères'],
      select: false, // Jamais renvoyé par défaut.
    },
    birthDate: {
      type: Date,
      default: null,
      validate: { validator: (value) => value === null || value < new Date(), message: 'La date de naissance doit être dans le passé' },
    },
    phone: { type: String, trim: true, maxlength: 20, default: null },
    city: { type: String, trim: true, maxlength: 100, default: null },
    bio: { type: String, trim: true, maxlength: 500, default: null },
    avatar: { type: String, trim: true, maxlength: 2048, default: null, validate: httpUrlValidator },
    // Numéro de version des tokens. Il augmente à chaque changement de mot de passe,
    // ce qui rend inutilisables tous les tokens émis avant.
    tokenVersion: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform: (doc, ret) => {
        delete ret.password;
        delete ret.tokenVersion;
        return ret;
      },
    },
  },
);

userSchema.index({ lastName: 1, firstName: 1 });

// Le mot de passe est haché avant chaque enregistrement s'il a changé.
userSchema.pre('save', async function hashPassword() {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, env.bcryptRounds);
    if (!this.isNew) this.tokenVersion += 1;
  }
});

userSchema.methods.checkPassword = function checkPassword(plainPassword) {
  return bcrypt.compare(plainPassword, this.password);
};

export const User = mongoose.model('User', userSchema);
