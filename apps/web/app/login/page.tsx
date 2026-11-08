import { redirect } from 'next/navigation';
import { getSession } from '../../lib/session';
import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in · JogyLink' };

export default async function LoginPage() {
  if (await getSession()) redirect('/');
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-card border border-sand bg-white p-6 shadow-level-2">
        <h1 className="text-h1 font-bold tracking-tight text-brand uppercase">JogyLink</h1>
        <p className="mt-1 mb-6 text-body text-stone">Sign in to manage Jogy Products.</p>
        <LoginForm />
      </div>
    </main>
  );
}
