"use client";

import { useState, useRef } from "react";
import { filesApi } from "@/services/api/files";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Upload, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function FilesPage() {
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; url: string; date: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const { data } = await filesApi.upload(file);
      setUploadedFiles((prev) => [
        { name: file.name, url: data?.url || "", date: new Date().toISOString() },
        ...prev,
      ]);
      toast.success(`${file.name} uploaded successfully`);
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">File Management</h1>
          <p className="text-muted-foreground">Upload and manage your files.</p>
        </div>
      </div>

      {/* Upload Area */}
      <Card className="border-dashed border-2 hover:border-secondary/50 transition-colors">
        <CardContent className="p-10">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="p-4 rounded-full bg-secondary/10 mb-4">
              <Upload className="h-8 w-8 text-secondary" />
            </div>
            <h3 className="font-semibold text-lg mb-1">Upload Files</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Click to select or drag and drop your files here
            </p>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleUpload}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="bg-secondary text-secondary-foreground hover:bg-secondary/90"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" /> Select File
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Uploaded Files */}
      {uploadedFiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Uploaded Files</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {uploadedFiles.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="p-2 rounded-lg bg-primary/10">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(file.date).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {uploadedFiles.length === 0 && !uploading && (
        <div className="text-center py-10">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground text-sm">No files uploaded yet.</p>
        </div>
      )}
    </div>
  );
}
