import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Save } from 'lucide-react';
import api, { unwrap, apiError } from '@/lib/api';
import { PageHeader, Card, CardHeader, CardBody, PageSpinner, EmptyState, Input, Button } from '@/components/ui';

function SettingRow({ setting }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(setting.value);
  useEffect(() => setValue(setting.value), [setting.value]);

  const save = useMutation({
    mutationFn: () => api.put(`/settings/${setting.key}`, { value, type: setting.type, group: setting.group, description: setting.description }),
    onSuccess: () => {
      toast.success(`Saved ${setting.key}`);
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
      <div className="sm:w-1/3">
        <div className="text-sm font-medium text-foreground">{setting.key}</div>
        {setting.description && <div className="text-xs text-faint">{setting.description}</div>}
      </div>
      <div className="flex flex-1 items-center gap-2">
        <Input value={value} onChange={(e) => setValue(e.target.value)} />
        <Button variant="secondary" loading={save.isPending} disabled={value === setting.value} onClick={() => save.mutate()}>
          <Save className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function Settings() {
  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => unwrap(await api.get('/settings')).data,
  });

  if (isLoading) return <PageSpinner />;

  const groups = (data || []).reduce((acc, s) => {
    (acc[s.group] = acc[s.group] || []).push(s);
    return acc;
  }, {});

  return (
    <div>
      <PageHeader title="Settings" subtitle="System-wide configuration." />
      {Object.keys(groups).length === 0 ? (
        <Card><EmptyState title="No settings found" message="Run the seed to populate defaults." /></Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(groups).map(([group, items]) => (
            <Card key={group}>
              <CardHeader title={group.charAt(0).toUpperCase() + group.slice(1)} />
              <CardBody>
                <div className="divide-y divide-border">
                  {items.map((s) => <SettingRow key={s.id} setting={s} />)}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
