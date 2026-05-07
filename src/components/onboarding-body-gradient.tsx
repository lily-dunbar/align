"use client";

import { useEffect } from "react";

export function OnboardingBodyGradient() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.classList.add("onboarding-gradient-bg");
    body.classList.add("onboarding-gradient-bg");
    html.classList.add("onboarding-overscroll-lock");
    body.classList.add("onboarding-overscroll-lock");
    return () => {
      html.classList.remove("onboarding-gradient-bg");
      body.classList.remove("onboarding-gradient-bg");
      html.classList.remove("onboarding-overscroll-lock");
      body.classList.remove("onboarding-overscroll-lock");
    };
  }, []);

  return null;
}

