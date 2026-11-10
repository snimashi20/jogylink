import { requireUser } from '../../lib/session';

export default async function HomePage() {
  const user = await requireUser();
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-h1 font-bold">Welcome, {user.name}</h1>
      <p className="mt-2 text-body text-stone">
        The dashboard, products, users and settings screens will appear here.
      </p>
    </main>
  );
}
