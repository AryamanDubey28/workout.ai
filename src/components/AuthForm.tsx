'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LoginData, RegisterData } from '@/types/user';
import { CheckCircle2, AlertCircle } from 'lucide-react';

interface AuthFormProps {
  onAuthSuccess: () => void;
}

export function AuthForm({ onAuthSuccess }: AuthFormProps) {
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
      console.log('Attempting login from:', navigator.userAgent);
      console.log('Login data:', { email: loginData.email, passwordLength: loginData.password.length });
      
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(loginData),
        credentials: 'include', // Ensure cookies are included
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));
      
      const result = await response.json();
      console.log('Response body:', result);

      if (!response.ok) {
        throw new Error(result.error || 'Login failed');
      }

      // Store user data in localStorage as backup for mobile
      if (result.user) {
        localStorage.setItem('workout-ai-user', JSON.stringify(result.user));
      }

      setSuccess('Login successful!');
      setTimeout(() => {
        onAuthSuccess();
      }, 1000);

    } catch (err) {
      console.error('Login error:', err);
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
      console.log('Attempting registration from:', navigator.userAgent);
      console.log('Registration data:', { 
        name: registerData.name, 
        email: registerData.email, 
        age: registerData.age, 
        weight: registerData.weight,
        hasSecretPassword: !!registerData.secretPassword,
        passwordLength: registerData.password.length 
      });
      
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(registerData),
        credentials: 'include', // Ensure cookies are included
      });

      console.log('Registration response status:', response.status);
      console.log('Registration response headers:', Object.fromEntries(response.headers.entries()));
      
      const result = await response.json();
      console.log('Registration response body:', result);

      if (!response.ok) {
        throw new Error(result.error || 'Registration failed');
      }

      // Store user data in localStorage as backup for mobile
      if (result.user) {
        localStorage.setItem('workout-ai-user', JSON.stringify(result.user));
      }

      setSuccess('Registration successful!');
      setTimeout(() => {
        onAuthSuccess();
      }, 1000);

    } catch (err) {
      console.error('Registration error:', err);
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col space-y-3 text-center">
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome to Workout AI
          </h1>
          <p className="text-muted-foreground">
            Track your fitness journey with AI-powered insights
          </p>
        </div>

        <Card className="border-border/40">
          <Tabs defaultValue="login" className="w-full" onValueChange={() => {
            setError('');
            setSuccess('');
          }}>
            <div className="p-6 pb-0">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Sign In</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="login" className="space-y-0">
              <CardHeader className="space-y-2 pb-4">
                <CardTitle className="text-2xl">Sign in to your account</CardTitle>
                <CardDescription>
                  Enter your email and password to access Workout AI
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <form onSubmit={handleLogin} className="space-y-5">
                  <div className="space-y-3">
                    <Label htmlFor="login-email" className="text-sm font-medium">
                      Email
                    </Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="name@example.com"
                      value={loginData.email}
                      onChange={(e) => setLoginData({...loginData, email: e.target.value})}
                      required
                      disabled={isLoading}
                      className="h-11"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="login-password" className="text-sm font-medium">
                      Password
                    </Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="Enter your password"
                      value={loginData.password}
                      onChange={(e) => setLoginData({...loginData, password: e.target.value})}
                      required
                      disabled={isLoading}
                      className="h-11"
                    />
                  </div>

                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  {success && (
                    <Alert className="border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
                      <CheckCircle2 className="h-4 w-4" />
                      <AlertDescription>{success}</AlertDescription>
                    </Alert>
                  )}

                  <Button type="submit" className="w-full h-11" disabled={isLoading}>
                    {isLoading ? 'Signing In...' : 'Sign In'}
                  </Button>
                </form>
              </CardContent>
            </TabsContent>

            <TabsContent value="register" className="space-y-0">
              <CardHeader className="space-y-2 pb-4">
                <CardTitle className="text-2xl">Create an account</CardTitle>
                <CardDescription>
                  Enter your details below to create your account
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <form onSubmit={handleRegister} className="space-y-6">
                  {/* Registration Secret */}
                  <div className="space-y-3">
                    <Label htmlFor="secret-password" className="text-sm font-medium">
                      Registration Secret
                    </Label>
                    <Input
                      id="secret-password"
                      type="password"
                      placeholder="Enter the registration secret"
                      value={registerData.secretPassword}
                      onChange={(e) => setRegisterData({...registerData, secretPassword: e.target.value})}
                      required
                      disabled={isLoading}
                      className="h-11"
                    />
                  </div>

                  <Separator className="my-6" />

                  {/* Personal Information */}
                  <div className="space-y-5">
                    <div className="space-y-3">
                      <Label htmlFor="register-name" className="text-sm font-medium">
                        Full Name
                      </Label>
                      <Input
                        id="register-name"
                        type="text"
                        placeholder="Enter your full name"
                        value={registerData.name}
                        onChange={(e) => setRegisterData({...registerData, name: e.target.value})}
                        required
                        disabled={isLoading}
                        className="h-11"
                      />
                    </div>

                    <div className="space-y-3">
                      <Label htmlFor="register-email" className="text-sm font-medium">
                        Email
                      </Label>
                      <Input
                        id="register-email"
                        type="email"
                        placeholder="name@example.com"
                        value={registerData.email}
                        onChange={(e) => setRegisterData({...registerData, email: e.target.value})}
                        required
                        disabled={isLoading}
                        className="h-11"
                      />
                    </div>

                    {/* Age and Weight */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <Label htmlFor="register-age" className="text-sm font-medium">
                          Age
                        </Label>
                        <Input
                          id="register-age"
                          type="number"
                          placeholder="25"
                          value={registerData.age || ''}
                          onChange={(e) => setRegisterData({...registerData, age: parseInt(e.target.value) || 0})}
                          required
                          min="13"
                          max="120"
                          disabled={isLoading}
                          className="h-11"
                        />
                      </div>
                      <div className="space-y-3">
                        <Label htmlFor="register-weight" className="text-sm font-medium">
                          Weight (lbs)
                        </Label>
                        <Input
                          id="register-weight"
                          type="number"
                          placeholder="150"
                          value={registerData.weight || ''}
                          onChange={(e) => setRegisterData({...registerData, weight: parseFloat(e.target.value) || 0})}
                          required
                          min="50"
                          max="500"
                          step="0.1"
                          disabled={isLoading}
                          className="h-11"
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label htmlFor="register-password" className="text-sm font-medium">
                        Password
                      </Label>
                      <Input
                        id="register-password"
                        type="password"
                        placeholder="Create a secure password"
                        value={registerData.password}
                        onChange={(e) => setRegisterData({...registerData, password: e.target.value})}
                        required
                        disabled={isLoading}
                        className="h-11"
                      />
                    </div>
                  </div>

                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  {success && (
                    <Alert className="border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
                      <CheckCircle2 className="h-4 w-4" />
                      <AlertDescription>{success}</AlertDescription>
                    </Alert>
                  )}

                  <Button type="submit" className="w-full h-11" disabled={isLoading}>
                    {isLoading ? 'Creating Account...' : 'Create Account'}
                  </Button>
                </form>
              </CardContent>
            </TabsContent>
          </Tabs>
        </Card>


      </div>
    </div>
  );
}