import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface UsernameDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (username: string) => void;
  initialUsername?: string | null;
}

export function UsernameDialog({
  isOpen,
  onClose,
  onSave,
  initialUsername,
}: UsernameDialogProps) {
  const [username, setUsername] = useState(initialUsername || "");
  const [error, setError] = useState("");

  const handleSave = () => {
    if (!username.trim()) {
      setError("Username cannot be empty");
      return;
    }

    if (username.length < 3) {
      setError("Username must be at least 3 characters");
      return;
    }

    onSave(username);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#0F0F0F] border border-[#1F2937] text-white">
        <DialogHeader>
          <DialogTitle>Set Your Username</DialogTitle>
          <DialogDescription className="text-gray-400">
            Choose a username that will be displayed in the NeuroSwarm network.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Label htmlFor="username" className="block text-sm font-medium mb-2">
            Username
          </Label>
          <Input
            id="username"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setError("");
            }}
            className="bg-[#1A1A1A] border-[#333] focus:border-blue-600 text-white"
            placeholder="Enter your username"
            autoFocus
          />
          {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            className="border-[#333] text-gray-300 hover:bg-[#1A1A1A]"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
