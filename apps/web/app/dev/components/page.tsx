import { notFound } from 'next/navigation';
import { Gallery } from './gallery';

/** Internal component gallery for the team. Hidden in production builds. */
export default function ComponentsPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <Gallery />;
}
