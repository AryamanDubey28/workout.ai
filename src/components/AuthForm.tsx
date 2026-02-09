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
import { CheckCircle2, AlertCircle, Dumbbell, Mail, Lock, User, Calendar, Weight } from 'lucide-react';

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
    dateOfBirth: '',
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
        dateOfBirth: registerData.dateOfBirth,
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
    <div className="relative flex items-center justify-center min-h-screen bg-background p-4 overflow-hidden">
      {/* Animated background pattern */}
      <div className="absolute inset-0 bg-grid-black/[0.02] dark:bg-grid-white/[0.02]" />
      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-primary/5 to-transparent" />
      
      {/* Floating geometric shapes */}
      <div className="absolute -top-4 -left-4 w-72 h-72 bg-primary/10 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob" />
      <div className="absolute -top-4 -right-4 w-72 h-72 bg-accent/10 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000" />
      <div className="absolute -bottom-8 left-20 w-72 h-72 bg-muted/20 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-4000" />
      
      <div className="relative w-full max-w-md space-y-8 z-10">
        {/* Header with enhanced visual hierarchy */}
        <div className="flex flex-col space-y-4 text-center">
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 rounded-full blur-lg" />
              <Dumbbell className="relative h-12 w-12 text-primary mx-auto" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text">
              Welcome to Workout AI
            </h1>
            <p className="text-muted-foreground text-lg">
              Track your fitness journey with AI-powered insights
            </p>
          </div>
        </div>

        {/* Enhanced card with glassmorphism */}
        <Card className="border-border/40 backdrop-blur-sm bg-card/80 shadow-2xl shadow-primary/5">
          <Tabs defaultValue="login" className="w-full" onValueChange={() => {
            setError('');
            setSuccess('');
          }}>
            <div className="p-6 pb-0">
              <TabsList className="grid w-full grid-cols-2 bg-muted/50 backdrop-blur-sm">
                <TabsTrigger value="login" className="data-[state=active]:bg-background/80 data-[state=active]:shadow-sm transition-all duration-200">Sign In</TabsTrigger>
                <TabsTrigger value="register" className="data-[state=active]:bg-background/80 data-[state=active]:shadow-sm transition-all duration-200">Register</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="login" className="space-y-0">
              <CardHeader className="space-y-3 pb-6">
                <CardTitle className="text-2xl font-semibold">Sign in to your account</CardTitle>
                <CardDescription className="text-base text-muted-foreground/80">
                  Enter your email and password to access Workout AI
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <form onSubmit={handleLogin} className="space-y-6">
                  <div className="space-y-3">
                    <Label htmlFor="login-email" className="text-sm font-medium flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      Email
                    </Label>
                    <div className="relative group">
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="name@example.com"
                        value={loginData.email}
                        onChange={(e) => setLoginData({...loginData, email: e.target.value})}
                        required
                        disabled={isLoading}
                        className="h-12 pl-4 bg-background/50 backdrop-blur-sm border-border/60 focus:border-primary/50 focus:bg-background/80 transition-all duration-200 group-hover:border-border/80"
                      />
                      <div className="absolute inset-0 rounded-md bg-gradient-to-r from-primary/10 to-transparent opacity-0 group-focus-within:opacity-100 transition-opacity duration-200 pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="login-password" className="text-sm font-medium flex items-center gap-2">
                      <Lock className="h-4 w-4 text-muted-foreground" />
                      Password
                    </Label>
                    <div className="relative group">
                      <Input
                        id="login-password"
                        type="password"
                        placeholder="Enter your password"
                        value={loginData.password}
                        onChange={(e) => setLoginData({...loginData, password: e.target.value})}
                        required
                        disabled={isLoading}
                        className="h-12 pl-4 bg-background/50 backdrop-blur-sm border-border/60 focus:border-primary/50 focus:bg-background/80 transition-all duration-200 group-hover:border-border/80"
                      />
                      <div className="absolute inset-0 rounded-md bg-gradient-to-r from-primary/10 to-transparent opacity-0 group-focus-within:opacity-100 transition-opacity duration-200 pointer-events-none" />
                    </div>
                  </div>

                  {error && (
                    <Alert variant="destructive" className="bg-destructive/5 border-destructive/20 backdrop-blur-sm animate-in fade-in-50 slide-in-from-top-1 duration-200">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  {success && (
                    <Alert className="border-green-200/60 bg-green-50/80 text-green-800 dark:border-green-800/60 dark:bg-green-950/80 dark:text-green-200 backdrop-blur-sm animate-in fade-in-50 slide-in-from-top-1 duration-200">
                      <CheckCircle2 className="h-4 w-4" />
                      <AlertDescription>{success}</AlertDescription>
                    </Alert>
                  )}

                  <Button 
                    type="submit" 
                    className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-200 disabled:opacity-50" 
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                        Signing In...
                      </div>
                    ) : (
                      'Sign In'
                    )}
                  </Button>
                </form>
              </CardContent>
            </TabsContent>

            <TabsContent value="register" className="space-y-0">
              <CardHeader className="space-y-3 pb-6">
                <CardTitle className="text-2xl font-semibold">Create an account</CardTitle>
                <CardDescription className="text-base text-muted-foreground/80">
                  Enter your details below to create your account
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <form onSubmit={handleRegister} className="space-y-6">
                  {/* Registration Secret */}
                  <div className="space-y-3">
                    <Label htmlFor="secret-password" className="text-sm font-medium flex items-center gap-2">
                      <Lock className="h-4 w-4 text-muted-foreground" />
                      Registration Secret
                    </Label>
                    <div className="relative group">
                      <Input
                        id="secret-password"
                        type="password"
                        placeholder="Enter the registration secret"
                        value={registerData.secretPassword}
                        onChange={(e) => setRegisterData({...registerData, secretPassword: e.target.value})}
                        required
                        disabled={isLoading}
                        className="h-12 pl-4 bg-background/50 backdrop-blur-sm border-border/60 focus:border-primary/50 focus:bg-background/80 transition-all duration-200 group-hover:border-border/80"
                      />
                      <div className="absolute inset-0 rounded-md bg-gradient-to-r from-primary/10 to-transparent opacity-0 group-focus-within:opacity-100 transition-opacity duration-200 pointer-events-none" />
                    </div>
                  </div>

                  <Separator className="my-6 bg-border/50" />

                  {/* Personal Information */}
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <Label htmlFor="register-name" className="text-sm font-medium flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        Full Name
                      </Label>
                      <div className="relative group">
                        <Input
                          id="register-name"
                          type="text"
                          placeholder="Enter your full name"
                          value={registerData.name}
                          onChange={(e) => setRegisterData({...registerData, name: e.target.value})}
                          required
                          disabled={isLoading}
                          className="h-12 pl-4 bg-background/50 backdrop-blur-sm border-border/60 focus:border-primary/50 focus:bg-background/80 transition-all duration-200 group-hover:border-border/80"
                        />
                        <div className="absolute inset-0 rounded-md bg-gradient-to-r from-primary/10 to-transparent opacity-0 group-focus-within:opacity-100 transition-opacity duration-200 pointer-events-none" />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label htmlFor="register-email" className="text-sm font-medium flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        Email
                      </Label>
                      <div className="relative group">
                        <Input
                          id="register-email"
                          type="email"
                          placeholder="name@example.com"
                          value={registerData.email}
                          onChange={(e) => setRegisterData({...registerData, email: e.target.value})}
                          required
                          disabled={isLoading}
                          className="h-12 pl-4 bg-background/50 backdrop-blur-sm border-border/60 focus:border-primary/50 focus:bg-background/80 transition-all duration-200 group-hover:border-border/80"
                        />
                        <div className="absolute inset-0 rounded-md bg-gradient-to-r from-primary/10 to-transparent opacity-0 group-focus-within:opacity-100 transition-opacity duration-200 pointer-events-none" />
                      </div>
                    </div>

                    {/* Date of Birth and Weight */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <Label htmlFor="register-dob" className="text-sm font-medium flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          Date of Birth
                        </Label>
                        <div className="relative group">
                          <Input
                            id="register-dob"
                            type="date"
                            value={registerData.dateOfBirth}
                            onChange={(e) => setRegisterData({...registerData, dateOfBirth: e.target.value})}
                            required
                            disabled={isLoading}
                            className="h-12 pl-4 bg-background/50 backdrop-blur-sm border-border/60 focus:border-primary/50 focus:bg-background/80 transition-all duration-200 group-hover:border-border/80"
                          />
                          <div className="absolute inset-0 rounded-md bg-gradient-to-r from-primary/10 to-transparent opacity-0 group-focus-within:opacity-100 transition-opacity duration-200 pointer-events-none" />
                        </div>
                      </div>
                      <div className="space-y-3">
                        <Label htmlFor="register-weight" className="text-sm font-medium flex items-center gap-2">
                          <Weight className="h-4 w-4 text-muted-foreground" />
                          Weight (lbs)
                        </Label>
                        <div className="relative group">
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
                            className="h-12 pl-4 bg-background/50 backdrop-blur-sm border-border/60 focus:border-primary/50 focus:bg-background/80 transition-all duration-200 group-hover:border-border/80"
                          />
                          <div className="absolute inset-0 rounded-md bg-gradient-to-r from-primary/10 to-transparent opacity-0 group-focus-within:opacity-100 transition-opacity duration-200 pointer-events-none" />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label htmlFor="register-password" className="text-sm font-medium flex items-center gap-2">
                        <Lock className="h-4 w-4 text-muted-foreground" />
                        Password
                      </Label>
                      <div className="relative group">
                        <Input
                          id="register-password"
                          type="password"
                          placeholder="Create a secure password"
                          value={registerData.password}
                          onChange={(e) => setRegisterData({...registerData, password: e.target.value})}
                          required
                          disabled={isLoading}
                          className="h-12 pl-4 bg-background/50 backdrop-blur-sm border-border/60 focus:border-primary/50 focus:bg-background/80 transition-all duration-200 group-hover:border-border/80"
                        />
                        <div className="absolute inset-0 rounded-md bg-gradient-to-r from-primary/10 to-transparent opacity-0 group-focus-within:opacity-100 transition-opacity duration-200 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  {error && (
                    <Alert variant="destructive" className="bg-destructive/5 border-destructive/20 backdrop-blur-sm animate-in fade-in-50 slide-in-from-top-1 duration-200">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  {success && (
                    <Alert className="border-green-200/60 bg-green-50/80 text-green-800 dark:border-green-800/60 dark:bg-green-950/80 dark:text-green-200 backdrop-blur-sm animate-in fade-in-50 slide-in-from-top-1 duration-200">
                      <CheckCircle2 className="h-4 w-4" />
                      <AlertDescription>{success}</AlertDescription>
                    </Alert>
                  )}

                  <Button 
                    type="submit" 
                    className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-200 disabled:opacity-50" 
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                        Creating Account...
                      </div>
                    ) : (
                      'Create Account'
                    )}
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
