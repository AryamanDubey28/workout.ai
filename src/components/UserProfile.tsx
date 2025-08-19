'use client';

import { User } from '@/types/user';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LogOut, User as UserIcon, Mail, Calendar, Weight } from 'lucide-react';

interface UserProfileProps {
  user: User;
  onLogout: () => void;
}

export function UserProfile({ user, onLogout }: UserProfileProps) {
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
      });
      onLogout();
    } catch (error) {
      console.error('Logout failed:', error);
      // Still call onLogout to clear the local state
      onLogout();
    }
  };

  return (
    <Card className="w-full max-w-md animate-scale-in border-border/50 shadow-lg">
      <CardHeader className="animate-slide-down">
        <CardTitle className="flex items-center gap-2">
          <UserIcon className="h-5 w-5 text-primary" />
          User Profile
        </CardTitle>
        <CardDescription>Your account information</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 stagger-children">
          <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors duration-200">
            <UserIcon className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium min-w-[60px]">Name:</span>
            <span className="text-foreground/80">{user.name}</span>
          </div>
          
          <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors duration-200">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium min-w-[60px]">Email:</span>
            <span className="text-foreground/80 truncate">{user.email}</span>
          </div>
          
          <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors duration-200">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium min-w-[60px]">Age:</span>
            <span className="text-foreground/80">{user.age} years old</span>
          </div>
          
          <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors duration-200">
            <Weight className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium min-w-[60px]">Weight:</span>
            <span className="text-foreground/80">{user.weight} lbs</span>
          </div>
        </div>
        
        <div className="animate-slide-up animation-delay-500">
          <Button 
            onClick={handleLogout} 
            variant="outline" 
            className="w-full mt-6 interactive-scale hover:bg-destructive/5 hover:border-destructive/20 hover:text-destructive transition-all duration-200"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
        
        {/* Version info */}
        <div className="flex justify-center mt-4 animate-fade-in animation-delay-700">
          <span className="text-xs text-muted-foreground/60 font-mono">
            v1.0.0
          </span>
        </div>
      </CardContent>
    </Card>
  );
}