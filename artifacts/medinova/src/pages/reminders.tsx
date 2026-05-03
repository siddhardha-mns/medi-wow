import React, { useState } from "react";
import {
  useListReminders,
  useCreateReminder,
  useUpdateReminder,
  useDeleteReminder,
  useLogReminderDose,
  getListRemindersQueryKey,
  getGetTodayRemindersQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetDashboardActivityQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pill, Clock, Pencil, Trash2, CheckCircle2, XCircle, SkipForward } from "lucide-react";

const COLORS = ["#6366F1", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];
const FREQUENCY_LABELS: Record<string, string> = {
  daily: "Once Daily",
  twice_daily: "Twice Daily",
  three_times_daily: "Three Times Daily",
  weekly: "Weekly",
  as_needed: "As Needed",
};

type ReminderFormData = {
  medicationName: string;
  dosage: string;
  frequency: string;
  times: string[];
  startDate: string;
  endDate: string;
  notes: string;
  color: string;
};

const defaultForm: ReminderFormData = {
  medicationName: "",
  dosage: "",
  frequency: "daily",
  times: ["08:00"],
  startDate: new Date().toISOString().split("T")[0],
  endDate: "",
  notes: "",
  color: "#6366F1",
};

function getTimesForFrequency(freq: string): string[] {
  switch (freq) {
    case "twice_daily": return ["08:00", "20:00"];
    case "three_times_daily": return ["08:00", "14:00", "20:00"];
    default: return ["08:00"];
  }
}

export default function Reminders() {
  const { data: reminders, isLoading } = useListReminders();
  const createReminder = useCreateReminder();
  const updateReminder = useUpdateReminder();
  const deleteReminder = useDeleteReminder();
  const logDose = useLogReminderDose();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ReminderFormData>(defaultForm);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListRemindersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetTodayRemindersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardActivityQueryKey() });
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const openEdit = (r: NonNullable<typeof reminders>[number]) => {
    setEditingId(r.id);
    setForm({
      medicationName: r.medicationName,
      dosage: r.dosage,
      frequency: r.frequency,
      times: r.times as string[],
      startDate: r.startDate,
      endDate: r.endDate ?? "",
      notes: r.notes ?? "",
      color: r.color ?? "#6366F1",
    });
    setDialogOpen(true);
  };

  const handleFrequencyChange = (freq: string) => {
    setForm((f) => ({ ...f, frequency: freq, times: getTimesForFrequency(freq) }));
  };

  const handleTimeChange = (idx: number, val: string) => {
    setForm((f) => {
      const times = [...f.times];
      times[idx] = val;
      return { ...f, times };
    });
  };

  const handleSubmit = async () => {
    if (!form.medicationName || !form.dosage) {
      toast({ title: "Missing fields", description: "Medication name and dosage are required.", variant: "destructive" });
      return;
    }
    try {
      if (editingId !== null) {
        await updateReminder.mutateAsync({
          id: editingId,
          data: {
            medicationName: form.medicationName,
            dosage: form.dosage,
            frequency: form.frequency as "daily" | "twice_daily" | "three_times_daily" | "weekly" | "as_needed",
            times: form.times,
            startDate: form.startDate,
            endDate: form.endDate || undefined,
            notes: form.notes || undefined,
            color: form.color,
          },
        });
        toast({ title: "Reminder updated" });
      } else {
        await createReminder.mutateAsync({
          data: {
            medicationName: form.medicationName,
            dosage: form.dosage,
            frequency: form.frequency as "daily" | "twice_daily" | "three_times_daily" | "weekly" | "as_needed",
            times: form.times,
            startDate: form.startDate,
            endDate: form.endDate || undefined,
            notes: form.notes || undefined,
            color: form.color,
          },
        });
        toast({ title: "Reminder created" });
      }
      invalidate();
      setDialogOpen(false);
    } catch {
      toast({ title: "Error", description: "Failed to save reminder.", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteReminder.mutateAsync({ id });
      invalidate();
      toast({ title: "Reminder deleted" });
    } catch {
      toast({ title: "Error", description: "Failed to delete reminder.", variant: "destructive" });
    }
  };

  const handleLog = async (id: number, scheduledTime: string, status: "taken" | "missed" | "skipped") => {
    try {
      await logDose.mutateAsync({
        id,
        data: { status, scheduledTime, takenAt: status === "taken" ? new Date().toISOString() : undefined },
      });
      invalidate();
      toast({ title: status === "taken" ? "Dose marked as taken" : status === "missed" ? "Dose marked as missed" : "Dose skipped" });
    } catch {
      toast({ title: "Error", description: "Failed to log dose.", variant: "destructive" });
    }
  };

  const handleToggleActive = async (r: NonNullable<typeof reminders>[number]) => {
    try {
      await updateReminder.mutateAsync({
        id: r.id,
        data: { isActive: !r.isActive },
      });
      invalidate();
    } catch {
      toast({ title: "Error", description: "Failed to update reminder.", variant: "destructive" });
    }
  };

  return (
    <div className="p-6 md:p-10 space-y-8 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reminders</h1>
          <p className="text-muted-foreground mt-1">Manage your medication schedules.</p>
        </div>
        <Button onClick={openCreate} data-testid="button-add-reminder">
          <Plus className="h-4 w-4 mr-2" />
          Add Reminder
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : !reminders || reminders.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Pill className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-medium mb-2">No reminders yet</h3>
            <p className="text-muted-foreground text-sm mb-4">Add your first medication reminder to get started.</p>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add Reminder
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {reminders.map((r) => (
            <Card key={r.id} className={`border-border/50 transition-opacity ${!r.isActive ? "opacity-60" : ""}`} data-testid={`card-reminder-${r.id}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="w-3 h-3 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: r.color ?? "#6366F1" }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-base">{r.medicationName}</h3>
                        <Badge variant="secondary" className="text-xs">{r.dosage}</Badge>
                        <Badge variant="outline" className="text-xs">{FREQUENCY_LABELS[r.frequency] ?? r.frequency}</Badge>
                        {!r.isActive && <Badge variant="secondary" className="text-xs text-muted-foreground">Paused</Badge>}
                      </div>
                      <div className="flex items-center gap-4 mt-2 flex-wrap">
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          {(r.times as string[]).join(", ")}
                        </div>
                        {r.notes && (
                          <p className="text-sm text-muted-foreground italic truncate max-w-xs">{r.notes}</p>
                        )}
                      </div>
                      {r.isActive && (
                        <div className="flex items-center gap-2 mt-3 flex-wrap">
                          {(r.times as string[]).map((t) => (
                            <div key={t} className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs text-green-600 border-green-200 hover:bg-green-50 dark:border-green-900 dark:hover:bg-green-950"
                                onClick={() => handleLog(r.id, t, "taken")}
                                data-testid={`button-taken-${r.id}-${t}`}
                              >
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Taken {t}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
                                onClick={() => handleLog(r.id, t, "missed")}
                                data-testid={`button-missed-${r.id}-${t}`}
                              >
                                <XCircle className="h-3 w-3 mr-1" />
                                Missed
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={r.isActive}
                      onCheckedChange={() => handleToggleActive(r)}
                      data-testid={`toggle-active-${r.id}`}
                    />
                    <Button size="icon" variant="ghost" onClick={() => openEdit(r)} data-testid={`button-edit-${r.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(r.id)} data-testid={`button-delete-${r.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Reminder" : "New Reminder"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="med-name">Medication Name</Label>
              <Input id="med-name" placeholder="e.g. Metformin" value={form.medicationName} onChange={(e) => setForm((f) => ({ ...f, medicationName: e.target.value }))} data-testid="input-medication-name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dosage">Dosage</Label>
              <Input id="dosage" placeholder="e.g. 500mg" value={form.dosage} onChange={(e) => setForm((f) => ({ ...f, dosage: e.target.value }))} data-testid="input-dosage" />
            </div>
            <div className="space-y-1.5">
              <Label>Frequency</Label>
              <Select value={form.frequency} onValueChange={handleFrequencyChange}>
                <SelectTrigger data-testid="select-frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Once Daily</SelectItem>
                  <SelectItem value="twice_daily">Twice Daily</SelectItem>
                  <SelectItem value="three_times_daily">Three Times Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="as_needed">As Needed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Times</Label>
              <div className="space-y-2">
                {form.times.map((t, idx) => (
                  <Input key={idx} type="time" value={t} onChange={(e) => handleTimeChange(idx, e.target.value)} data-testid={`input-time-${idx}`} />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Date</Label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} data-testid="input-start-date" />
              </div>
              <div className="space-y-1.5">
                <Label>End Date (optional)</Label>
                <Input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} data-testid="input-end-date" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`w-7 h-7 rounded-full border-2 transition-transform ${form.color === c ? "scale-125 border-foreground" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    data-testid={`button-color-${c}`}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea placeholder="e.g. Take with food" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} data-testid="textarea-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createReminder.isPending || updateReminder.isPending} data-testid="button-save-reminder">
              {editingId ? "Save Changes" : "Add Reminder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
