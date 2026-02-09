export interface User {
  id: string;
  name: string;
  email: string;
  age: number;
  dateOfBirth?: string; // YYYY-MM-DD
  weight: number;
  password?: string; // Optional for security - won't be returned in most cases
  created_at: Date;
}

export interface CreateUserData {
  name: string;
  email: string;
  dateOfBirth: string; // YYYY-MM-DD
  weight: number;
  password: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface RegisterData extends CreateUserData {
  secretPassword: string;
}
