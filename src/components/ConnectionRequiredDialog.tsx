import { ConnectionRequiredDialog } from '@/components/ConnectionRequiredDialog';

// Inside your component:
const [showConnectionDialog, setShowConnectionDialog] = useState(false);

const handleConnect = () => {
  // Your connection logic here
  setShowConnectionDialog(false);
};

// In your JSX:
<ConnectionRequiredDialog 
  open={showConnectionDialog}
  onOpenChange={setShowConnectionDialog}
  onConnect={handleConnect}
/>import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/connection-dialog';
import { Button } from '@/components/ui/button';

interface ConnectionRequiredDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnect: () => void;
}

export function ConnectionRequiredDialog({
  open,
  onOpenChange,
  onConnect,
}: ConnectionRequiredDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connection Required</DialogTitle>
          <DialogDescription>
            Connect your Swarm account to our Neurolov App to get exclusive access and subscription plans
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-start">
          <Button
            type="button"
            variant="default"
            className="bg-[#515194] hover:bg-[#515194]/90 text-white"
            onClick={onConnect}
          >
            Connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
