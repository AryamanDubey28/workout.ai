'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginData, RegisterData } from '@/types/user';

interface AuthFormProps {
  onAuthSuccess: () => void;
}

export function AuthForm({ onAuthSuccess }: AuthFormProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [loginData, setLoginData] = useState<LoginData>({
    email: '',
    password: ''
  });

  const [registerData, setRegisterData] = useState<RegisterData>({
    secretPassword: '',
    name: '',
    email: '',
    age: 0,
    weight: 0,
    password: ''
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(loginData),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Login failed');
      }

      setSuccess('Login successful!');
      setTimeout(() => {
        onAuthSuccess();
      }, 1000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(registerData),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Registration failed');
      }

      setSuccess('Registration successful!');
      setTimeout(() => {
        onAuthSuccess();
      }, 1000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{isLogin ? 'Sign In' : 'Register'}</CardTitle>
          <CardDescription>
            {isLogin 
              ? 'Enter your email and password to sign in to Workout AI'
              : 'Register a new account with the secret password'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={isLogin ? handleLogin : handleRegister} className="space-y-4">
            {!isLogin && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="secretPassword">Secret Password</Label>
                  <Input
                    id="secretPassword"
                    type="password"
                    placeholder="Enter the registration secret"
                    value={registerData.secretPassword}
                    onChange={(e) => setRegisterData({...registerData, secretPassword: e.target.value})}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Enter your full name"
                    value={registerData.name}
                    onChange={(e) => setRegisterData({...registerData, name: e.target.value})}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="age">Age</Label>
                    <Input
                      id="age"
                      type="number"
                      placeholder="Age"
                      value={registerData.age || ''}
                      onChange={(e) => setRegisterData({...registerData, age: parseInt(e.target.value) || 0})}
                      required
                      min="13"
                      max="120"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="weight">Weight (lbs)</Label>
                    <Input
                      id="weight"
                      type="number"
                      placeholder="Weight"
                      value={registerData.weight || ''}
                      onChange={(e) => setRegisterData({...registerData, weight: parseFloat(e.target.value) || 0})}
                      required
                      min="50"
                      max="500"
                      step="0.1"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={isLogin ? loginData.email : registerData.email}
                onChange={(e) => {
                  if (isLogin) {
                    setLoginData({...loginData, email: e.target.value});
                  } else {
                    setRegisterData({...registerData, email: e.target.value});
                  }
                }}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={isLogin ? loginData.password : registerData.password}
                onChange={(e) => {
                  if (isLogin) {
                    setLoginData({...loginData, password: e.target.value});
                  } else {
                    setRegisterData({...registerData, password: e.target.value});
                  }
                }}
                required
              />
            </div>

            {error && (
              <div className="text-destructive text-sm p-2 bg-destructive/10 rounded">
                {error}
              </div>
            )}

            {success && (
              <div className="text-green-600 text-sm p-2 bg-green-100 dark:bg-green-900/20 rounded">
                {success}
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading}
            >
              {isLoading ? (isLogin ? 'Signing In...' : 'Registering...') : (isLogin ? 'Sign In' : 'Register')}
            </Button>

            <div className="text-center">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError('');
                  setSuccess('');
                }}
                disabled={isLoading}
              >
                {isLogin ? "Don't have an account? Register" : "Already have an account? Sign In"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}