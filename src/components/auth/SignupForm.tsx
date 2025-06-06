import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useSession } from "@/hooks/useSession";
import { WalletConnectionModal } from "./WalletConnectionModal";
import { SignupSuccessModal } from "./SignupSuccessModal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { ConnectAppModal } from "@/components/ConnectAppModal";

const formSchema = z
  .object({
    email: z.string().email("Invalid email address"),
    username: z.string().min(3, "Username must be at least 3 characters"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

interface SignupFormProps {
  onSuccess: () => void;
}

export function SignupForm({ onSuccess }: SignupFormProps) {
  const { signupWithEmail } = useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [emailVerificationRequired, setEmailVerificationRequired] =
    useState(false);
  const [userEmail, setUserEmail] = useState("");

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      username: "",
      password: "",
      confirmPassword: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    try {
      const result = await signupWithEmail(
        values.email,
        values.password,
        values.username
      );

      if (result?.requiresEmailConfirmation) {
        // Show email verification alert
        setEmailVerificationRequired(true);
        setUserEmail(values.email);
      } else {
        // After successful signup, show success modal
        setShowSuccessModal(true);
      }
    } catch (error) {
      console.error("Signup failed:", error);
      form.setError("root", {
        message: "Failed to create account. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  const handleSuccessModalClose = () => {
    setShowSuccessModal(false);
    onSuccess();
  };

  const handleContinueToWallet = () => {
    setShowSuccessModal(false);
    // Show connect app modal after a delay
    setTimeout(() => {
      setShowConnectModal(true);
    }, 500);
  };

  const handleWalletModalClose = () => {
    setShowWalletModal(false);
    onSuccess(); // Close the auth modal when wallet modal is closed
  };

  const handleConnectModalClose = () => {
    setShowConnectModal(false);
    setShowWalletModal(true); // Show wallet modal after connect modal is closed
  };

  return (
    <>
      {emailVerificationRequired && (
        <Alert className="mb-4 bg-blue-50 border-blue-200">
          <Info className="h-4 w-4 text-blue-500" />
          <AlertDescription className="text-blue-700">
            Please check your inbox at <strong>{userEmail}</strong> to verify
            your email address before logging in.
          </AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white">Email</FormLabel>
                <FormControl>
                  <Input
                    placeholder="you@example.com"
                    {...field}
                    className="bg-[#0A1A2F] border-[#112544] text-white"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white">Username</FormLabel>
                <FormControl>
                  <Input
                    placeholder="cooluser123"
                    {...field}
                    className="bg-[#0A1A2F] border-[#112544] text-white"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white">Password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    {...field}
                    className="bg-[#0A1A2F] border-[#112544] text-white"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white">Confirm Password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    {...field}
                    className="bg-[#0A1A2F] border-[#112544] text-white"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {form.formState.errors.root && (
            <div className="text-sm text-red-500">
              {form.formState.errors.root.message}
            </div>
          )}
          <Button
            type="submit"
            className="w-full bg-[#0066FF] hover:bg-[#0052CC] text-white"
            disabled={isLoading}
          >
            {isLoading ? "Creating account..." : "Sign Up"}
          </Button>
        </form>
      </Form>

      <SignupSuccessModal
        isOpen={showSuccessModal}
        onClose={handleSuccessModalClose}
        onContinue={handleContinueToWallet}
      />

      <ConnectAppModal
        isOpen={showConnectModal}
        onClose={handleConnectModalClose}
      />

      <WalletConnectionModal
        isOpen={showWalletModal}
        onClose={handleWalletModalClose}
      />
    </>
  );
}
