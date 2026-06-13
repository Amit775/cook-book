export interface UserProfile {
  /** Firebase Auth user id; also the document id under the `users` collection. */
  userId: string;
  displayName: string;
  photoUrl: string | null;
  phoneNumber: string | null;
  createdAt: Date;
}
