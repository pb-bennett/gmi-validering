export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
      <main className="mx-auto w-full max-w-4xl px-6 py-12">
        <section className="rounded-md bg-white/80 p-8 shadow-sm dark:bg-gray-900/60">
          <h2 className="text-2xl font-semibold">
            Welcome to GMI Validator
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            A minimal Next.js + Tailwind boilerplate. Start building
            your app here.
          </p>
        </section>
      </main>
    </div>
  );
}
