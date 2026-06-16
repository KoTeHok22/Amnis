"use client";

import { Toaster as Sonner, ToasterProps } from "sonner@2.0.3";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      position="top-center"
      toastOptions={{
        style: {
          background: "rgba(20, 17, 50, 0.95)",
          border: "1px solid rgba(169, 152, 255, 0.25)",
          color: "#E8E6F5",
          backdropFilter: "blur(12px)",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
