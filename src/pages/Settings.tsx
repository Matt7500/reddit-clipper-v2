import { Settings as SettingsIcon, ArrowLeft } from "lucide-react";
import { Settings as SettingsComponent } from "@/components/Settings";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const Settings = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#222222]">
      <div className="flex flex-col p-6 md:p-8 max-w-7xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate('/')}
          className="text-white hover:bg-white/10 gap-3 w-fit mb-8 text-lg px-4 py-3"
        >
          <ArrowLeft className="w-6 h-6" />
          Back
        </Button>
        
        <div className="flex items-center gap-3 mb-8">
          <SettingsIcon className="w-7 h-7 text-primary" />
          <h1 className="text-3xl font-bold text-white">Settings</h1>
        </div>
        
        <div className="w-full">
          <SettingsComponent />
        </div>
      </div>
    </div>
  );
};

export default Settings;
