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

const formSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

interface LoginFormProps {
  onSuccess: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const { loginWithEmail, session } = useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    try {
      await loginWithEmail(values.email, values.password);

      // If login successful and user doesn't have a wallet connected yet, show wallet modal
      if (!session.walletAddress) {
        setShowWalletModal(true);
      } else {
        onSuccess();
      }
    } catch (error) {
      console.error("Login failed:", error);
      form.setError("root", {
        message: "Invalid email or password",
      });
    } finally {
      setIsLoading(false);
    }
  }

  const handleWalletModalClose = () => {
    setShowWalletModal(false);
    onSuccess(); // Close the auth modal when wallet modal is closed
  };

  return (
    <>
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
            {isLoading ? "Logging in..." : "Login"}
          </Button>
        </form>
      </Form>

      <WalletConnectionModal
        isOpen={showWalletModal}
        onClose={handleWalletModalClose}
      />
    </>
  );
}
