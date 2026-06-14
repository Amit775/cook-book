export interface UserProfile {
  /** Firebase Auth user id; also the document id under the `users` collection. */
  userId: string;
  displayName: string;
  /** Lowercased email, used to look the user up when sharing. `null` if unknown. */
  email: string | null;
  photoUrl: string | null;
  phoneNumber: string | null;
  createdAt: Date;
}
