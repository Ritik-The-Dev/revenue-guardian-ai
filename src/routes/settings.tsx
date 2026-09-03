import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Settings2, Save } from "lucide-react";
import { AppLayout } from "../components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { api, type PolicySettings } from "../lib/api";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: api.settings.get,
  });

  const [form, setForm] = useState<PolicySettings>({
    maxRetryAttempts: 2,
    maxOutreachAttempts: 2,
    cooldownHours: 24,
    minimumRecoveryValue: 100,
    highValueThreshold: 25000,
    lowConfidenceThreshold: 0.6,
  });

  // Populate form once data arrives
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (values: PolicySettings) => api.settings.save(values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  function handleChange(key: keyof PolicySettings, raw: string) {
    const num = key === "lowConfidenceThreshold" ? parseFloat(raw) : parseInt(raw, 10);
    setForm((f) => ({ ...f, [key]: isNaN(num) ? f[key] : num }));
  }

  const fields: {
    key: keyof PolicySettings;
    label: string;
    description: string;
    min: number;
    max: number;
    step: number;
  }[] = [
    {
      key: "maxRetryAttempts",
      label: "Max Retry Attempts",
      description: "Maximum number of automatic payment retries before stopping.",
      min: 0, max: 10, step: 1,
    },
    {
      key: "maxOutreachAttempts",
      label: "Max Outreach Attempts",
      description: "Maximum notifications (WhatsApp/Email) sent per recovery case.",
      min: 0, max: 10, step: 1,
    },
    {
      key: "cooldownHours",
      label: "Cooldown Hours",
      description: "Minimum hours between outreach attempts.",
      min: 0, max: 720, step: 1,
    },
    {
      key: "minimumRecoveryValue",
      label: "Minimum Recovery Value (₹)",
      description: "Cases with expected recovery value below this are stopped automatically.",
      min: 0, max: 100000, step: 50,
    },
    {
      key: "highValueThreshold",
      label: "High-Value Threshold (₹)",
      description: "Payments above this amount receive a payment link instead of a retry.",
      min: 0, max: 1000000, step: 1000,
    },
    {
      key: "lowConfidenceThreshold",
      label: "Low Confidence Threshold",
      description: "AI confidence below this triggers escalation (0.0–1.0).",
      min: 0, max: 1, step: 0.05,
    },
  ];

  return (
    <AppLayout>
      <div className="p-6 max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <Settings2 className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Policy engine limits — persisted to the database and applied to all new cases
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading settings…</div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Recovery Policy Limits</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {fields.map(({ key, label, description, min, max, step }) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={key} className="text-sm font-medium">{label}</Label>
                  <p className="text-xs text-muted-foreground">{description}</p>
                  <Input
                    id={key}
                    type="number"
                    min={min}
                    max={max}
                    step={step}
                    value={form[key]}
                    onChange={(e) => handleChange(key, e.target.value)}
                    className="w-48"
                  />
                </div>
              ))}

              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={() => saveMutation.mutate(form)}
                  disabled={saveMutation.isPending}
                  className="gap-1.5"
                >
                  <Save className="h-3.5 w-3.5" />
                  {saveMutation.isPending ? "Saving…" : "Save Settings"}
                </Button>
                {saved && (
                  <span className="text-sm text-green-600 font-medium">✓ Settings saved</span>
                )}
                {saveMutation.isError && (
                  <span className="text-sm text-red-500">Failed to save — check backend connection</span>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-amber-100 bg-amber-50">
          <CardContent className="px-5 py-4 text-sm text-amber-800 space-y-1">
            <p className="font-medium">How settings work</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Changes are persisted to the database immediately on save.</li>
              <li>New recovery cases use the latest saved settings.</li>
              <li>In-progress cases use the settings active when they were created.</li>
              <li>The policy engine always overrides the AI recommendation.</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
