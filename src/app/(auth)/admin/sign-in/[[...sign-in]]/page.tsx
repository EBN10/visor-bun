import { SignIn } from "@clerk/nextjs";

export default function AdminSignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <SignIn 
        path="/admin/sign-in" 
        routing="path" 
        signUpUrl={undefined}
        forceRedirectUrl="/admin"
      />
    </div>
  );
}
