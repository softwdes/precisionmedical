export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-0">
      <div className="w-full max-w-md space-y-8 p-8 bg-surface rounded-lg shadow-soft border border-border">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight text-text-1">Precision Medical</h2>
          <p className="text-sm text-text-2 mt-2">Sign in to your account</p>
        </div>
        <form className="mt-8 space-y-6">
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-text-2">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="mt-1 block w-full rounded-md border border-border bg-bg-1 px-3 py-2 text-text-1 shadow-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand sm:text-sm"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-text-2">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="mt-1 block w-full rounded-md border border-border bg-bg-1 px-3 py-2 text-text-1 shadow-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand sm:text-sm"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              className="flex w-full justify-center rounded-md bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-2 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
            >
              Sign in
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
