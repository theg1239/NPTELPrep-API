import { authOptions } from "@/auth";
import { redirect } from "next/navigation";
import auth from "next-auth";
import ClientNewKeyForm from "./ClientNewKeyForm";
import { TuiPanel } from "@/components/tui/components";

const CREATE_KEY_ASCII = `
╔═╗╦═╗╔═╗╔═╗╔╦╗╔═╗  ╔═╗╔═╗╦  ╦╔═╔═╗╦ ╦
║  ╠╦╝║╣ ╠═╣ ║ ║╣   ╠═╣╠═╝║  ╠╩╗║╣ ╚╦╝
╚═╝╩╚═╚═╝╩ ╩ ╩ ╚═╝  ╩ ╩╩  ╩  ╩ ╩╚═╝ ╩ 
`;

export default async function NewApiKeyPage() {
  const session = await auth(authOptions);

  if (!session) {
    redirect("/auth/login");
  }

  return (
    <div className="tui-content-mobile text-tui-white pb-16 md:pb-0">
      <div className="border-b border-tui-blue text-sm mb-4 pb-1 flex items-center justify-between">
        <div className="flex items-center">
          <span className="text-tui-blue mr-2">NORMAL</span>
          <span className="text-tui-white">create-key.ts</span>
          <span className="text-tui-gray ml-2">[+]</span>
        </div>
        <div className="text-tui-gray">{new Date().toLocaleDateString()}</div>
      </div>
      
      <pre className="text-tui-green mb-6 text-center leading-tight">
        {CREATE_KEY_ASCII}
      </pre>
      
      <div className="space-y-6">
        <TuiPanel title="Create New API Key" color="cyan">
          <div className="px-3 py-2">
            <p className="text-tui-white text-sm mb-4">
              Generate a new API key to access the NPTEL API services.
            </p>
            <ClientNewKeyForm />
          </div>
        </TuiPanel>
      </div>
      
      <div className="mt-6 border-t border-tui-gray pt-3">
        <pre className="text-tui-gray text-xs">
    Press <span className="text-tui-cyan">Esc</span> to cancel, <span className="text-tui-cyan">i</span> to edit fields, <span className="text-tui-cyan">Enter</span> to submit
        </pre>
      </div>
    </div>
  );
}