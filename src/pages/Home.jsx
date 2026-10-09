import { PlusIcon } from '@heroicons/react/24/solid'

export default function Home() {

  return (
    <div className="flex-1 flex items-center justify-center bg-background p-4 md:p-8">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 md:p-8 shadow-sm text-center">
        <div className="mb-6">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <PlusIcon className="w-8 h-8 text-primary" />
          </div>
        </div>
        <p className="text-xl font-semibold text-card-foreground">Start a new chat</p>
        <p className="text-sm mt-2 text-muted-foreground">Create a new conversation to begin messaging with friends and groups.</p>
      </div>
    </div>
  )
}
