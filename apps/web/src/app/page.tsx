import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-4xl font-bold tracking-tight">
          MAGA Image Editor
        </h1>
        <p className="text-muted-foreground max-w-md text-lg">
          Powerful image editing for everyone. Coming soon.
        </p>
      </div>
      <ThemeToggle />
    </main>
  );
}
