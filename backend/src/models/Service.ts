import mongoose, { Schema, Document } from 'mongoose';
import { getEmbedding } from '../utils';

export interface IService extends Document {
  title: string;
  description: string;
  provider: string;
  communicationChannel: string;
  createdAt: Date;
  updatedAt: Date;
}

const ServiceSchema: Schema = new Schema({
  serviceId: { type: String, required: true },
  title: { type: String, required: true },
  embedding: { type: [Number], select: false },
  description: { type: String, required: true },
  provider: { type: String, required: true },
  communicationChannel: { type: String, required: true },
  paused: { type: Boolean, required: true, default: false },
}, { timestamps: true });

ServiceSchema.pre('save', async function (next) {
  if (this.isModified('title') || this.isModified('description')) {
    const embedding = await getEmbedding(this.title as string + ' ' + this.description as string);
    this.embedding = embedding;
  }
  next();
});

ServiceSchema.pre('updateOne', async function (next) {
  const update = this.getUpdate() as any;
  if (!update) {
    return next();
  }
  
  if (update.title || update.description) {
    update.embedding = await getEmbedding(update.title as string + ' ' + update.description as string);
  }
  next();
});

export const Service = mongoose.model<IService>('Service', ServiceSchema); 
