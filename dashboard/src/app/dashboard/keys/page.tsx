import { getUserApiKeys, revokeApiKey } from "@/actions/api-key";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { TuiButton, TuiPanel, TuiTable, TuiAlert, TuiCode } from "@/components/tui/components";


export default async function ApiKeysPage() {
  const session = await getServerSession(authOptions);
  const apiKeys = await getUserApiKeys();
  
  const keyRows = apiKeys.map(key => [
    <span key={`name-${key.id}`} className="text-tui-cyan">{key.name}</span>,
    <span key={`created-${key.id}`}>{new Date(key.createdAt).toLocaleDateString()}</span>,
    <span key={`limit-${key.id}`} className="text-tui-yellow">{key.rateLimit}/day</span>,
    <span key={`status-${key.id}`} className={key.isRevoked ? "text-tui-red" : "text-tui-green"}>
      {key.isRevoked ? "REVOKED" : "ACTIVE"}
    </span>,
    <div key={`actions-${key.id}`} className="flex gap-2">
      <TuiButton
        href={`/dashboard/keys/${key.id}`}
        variant="secondary"
        size="sm"
      >
        View
      </TuiButton>
      {!key.isRevoked && (
        <form action={async () => {
          "use server";
          await revokeApiKey(key.id);
        }}>
          <TuiButton
            variant="destructive"
            size="sm"
            type="submit"
          >
            Revoke
          </TuiButton>
        </form>
      )}
    </div>
  ]);

  return (
    <div className="tui-content-mobile text-tui-white pb-10 md:pb-0">
      <div className="border-b border-tui-blue text-sm mb-3 pb-1 flex items-center justify-between">
        <div className="flex items-center">
          <span className="text-tui-blue mr-2">NORMAL</span>
          <span className="text-tui-white">api-keys.js</span>
          <span className="text-tui-gray ml-2">[+]</span>
        </div>
        <div className="text-tui-gray">{new Date().toLocaleDateString()}</div>
      </div>
      
      
      <div className="flex justify-between items-center mb-3">
        <div className="text-tui-gray text-sm">
          {apiKeys.length} {apiKeys.length === 1 ? 'key' : 'keys'} found
        </div>
        <TuiButton
          href="/dashboard/keys/new"
          variant="success"
          shortcut="n"
          size="sm"
        >
          New API Key
        </TuiButton>
      </div>
      
      <TuiPanel title="API Keys" color="blue">
        <div className="px-1 py-2">
          {apiKeys.length > 0 ? (
            <TuiTable
              headers={["Name", "Created", "Rate Limit", "Status", "Actions"]}
              rows={keyRows}
              keyboardNav
            />
          ) : (
            <div className="border border-tui-blue p-3 text-center">
              <p className="text-tui-gray text-sm">No API keys found</p>
              <TuiButton 
                href="/dashboard/keys/new" 
                variant="success"
                className="mt-2"
                size="sm"
              >
                Create Your First API Key
              </TuiButton>
            </div>
          )}
        </div>
      </TuiPanel>
      
      <TuiPanel title="How to Use API Keys" color="green" className="mt-3" collapsible>
        <div className="px-2 py-2 space-y-2 text-xs">
          <p>
            Your API key should be included in all API requests to the server in a header that looks like:
          </p>
          
          <pre className="bg-black border border-tui-gray px-2 py-1 overflow-x-auto text-tui-white">
            Authorization: Bearer YOUR_API_KEY
          </pre>
          
          <TuiAlert
            type="warning"
            message="Never share your API keys in public repositories or client-side code."
            className="mt-2"
          />
        </div>
      </TuiPanel>
      
      <div className="mt-3 border-t border-tui-gray pt-2">
        <pre className="text-tui-gray text-xs">
    Keys: j/k to navigate, Enter to view details, n to create new key
        </pre>
      </div>
    </div>
  );
}