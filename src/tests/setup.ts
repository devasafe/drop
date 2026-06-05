import { connectDB, disconnectDB } from '../../src/db';

export default async function globalSetup() {
  await connectDB();
}

export async function globalTeardown() {
  await disconnectDB();
}
