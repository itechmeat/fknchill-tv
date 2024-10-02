/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { FC, useEffect, useRef, useState } from "react";
import Meyda from "meyda";
import styles from "./Breath.module.scss";

const INITIAL_BREATH_THRESHOLD = 0.001;
const INITIAL_SILENCE_THRESHOLD = 0.005;
const TASK_COMPLETION_TIME_MS = 3000;
const CALIBRATION_TIME_MS = 5000;
const CALIBRATION_BREATH_MULTIPLIER = 1.2;
const CALIBRATION_SILENCE_MULTIPLIER = 0.7;

const BREATH_FREQ_RANGE = [50, 3000];

const ProgressBar: FC<{ progress: number }> = ({ progress }) => (
  <div className={styles.progressBar}>
    <div className={styles.progressFill} style={{ width: `${progress}%` }} />
  </div>
);

const Breath: FC = () => {
  const [isInhaleCompleted, setIsInhaleCompleted] = useState(false);
  const [isExhaleCompleted, setIsExhaleCompleted] = useState(false);
  const [inhaleProgress, setInhaleProgress] = useState(0);
  const [exhaleProgress, setExhaleProgress] = useState(0);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [permissionStatus, setPermissionStatus] =
    useState<PermissionState | null>(null);
  const [breathIntensity, setBreathIntensity] = useState(0);
  const [isBreathing, setIsBreathing] = useState(false);
  const [breathThreshold, setBreathThreshold] = useState(
    INITIAL_BREATH_THRESHOLD
  );
  const [silenceThreshold, setSilenceThreshold] = useState(
    INITIAL_SILENCE_THRESHOLD
  );
  const [isCalibrating, setIsCalibrating] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<any>(null);
  const taskStartTimeRef = useRef<{ [key: string]: number }>({});
  const breathDetectedRef = useRef<boolean>(false);
  const calibrationDataRef = useRef<number[]>([]);
  const previousIntensityRef = useRef<number>(0);

  const startTaskTimer = (taskName: string) => {
    if (!taskStartTimeRef.current[taskName]) {
      taskStartTimeRef.current[taskName] = Date.now();
    }
  };

  const updateTaskProgress = (taskName: string, isConditionMet: boolean) => {
    if (taskName !== getTaskName(currentTaskIndex)) return;

    if (!isConditionMet) {
      delete taskStartTimeRef.current[taskName];
      switch (taskName) {
        case "inhale":
          setInhaleProgress(0);
          break;
        case "exhale":
          setExhaleProgress(0);
          break;
      }
      return;
    }

    const startTime = taskStartTimeRef.current[taskName];
    if (startTime) {
      const elapsedTime = Date.now() - startTime;
      const progress = Math.min(
        (elapsedTime / TASK_COMPLETION_TIME_MS) * 100,
        100
      );
      switch (taskName) {
        case "inhale":
          setInhaleProgress(progress);
          if (progress === 100) {
            setIsInhaleCompleted(true);
            setCurrentTaskIndex(1);
          }
          break;
        case "exhale":
          setExhaleProgress(progress);
          if (progress === 100) {
            setIsExhaleCompleted(true);
            setCurrentTaskIndex(2);
          }
          break;
      }
    }
  };

  const getTaskName = (index: number): string => {
    switch (index) {
      case 0:
        return "inhale";
      case 1:
        return "exhale";
      default:
        return "";
    }
  };

  const calibrate = () => {
    setIsCalibrating(true);
    calibrationDataRef.current = [];
    setTimeout(() => {
      const avgIntensity =
        calibrationDataRef.current.reduce((a, b) => a + b, 0) /
        calibrationDataRef.current.length;
      setBreathThreshold(avgIntensity * CALIBRATION_BREATH_MULTIPLIER);
      setSilenceThreshold(avgIntensity * CALIBRATION_SILENCE_MULTIPLIER);
      setIsCalibrating(false);
    }, CALIBRATION_TIME_MS);
  };

  const getFrequencyIntensity = (
    spectrum: Float32Array,
    lowFreq: number,
    highFreq: number,
    sampleRate: number
  ): number => {
    const lowIndex = Math.floor(lowFreq / (sampleRate / spectrum.length));
    const highIndex = Math.ceil(highFreq / (sampleRate / spectrum.length));
    let sum = 0;
    for (let i = lowIndex; i <= highIndex && i < spectrum.length; i++) {
      sum += spectrum[i];
    }
    return sum / (highIndex - lowIndex + 1);
  };

  useEffect(() => {
    const checkPermissions = async () => {
      if (
        typeof navigator !== "undefined" &&
        navigator.permissions &&
        navigator.permissions.query
      ) {
        try {
          const result = await navigator.permissions.query({
            name: "microphone" as PermissionName,
          });
          setPermissionStatus(result.state);
          result.onchange = () => {
            setPermissionStatus(result.state);
          };
        } catch (err) {
          console.error("Permission check failed:", err);
          setPermissionStatus("denied");
        }
      } else {
        setPermissionStatus("prompt");
      }
    };

    checkPermissions();
  }, []);

  useEffect(() => {
    let active = true;

    const initializeAudio = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        audioContextRef.current = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
        const source = audioContextRef.current.createMediaStreamSource(stream);

        analyzerRef.current = Meyda.createMeydaAnalyzer({
          audioContext: audioContextRef.current,
          source: source,
          bufferSize: 1024,
          featureExtractors: ["amplitudeSpectrum"],
          callback: (features: any) => {
            if (!active) return;
            const spectrum = features.amplitudeSpectrum;
            const sampleRate = audioContextRef.current!.sampleRate;

            const breathIntensity = getFrequencyIntensity(
              spectrum,
              BREATH_FREQ_RANGE[0],
              BREATH_FREQ_RANGE[1],
              sampleRate
            );
            setBreathIntensity(breathIntensity);

            const isBreathingNow = breathIntensity > breathThreshold;
            setIsBreathing(isBreathingNow);

            if (isCalibrating) {
              calibrationDataRef.current.push(breathIntensity);
            } else {
              const intensityDelta =
                breathIntensity - previousIntensityRef.current;

              if (currentTaskIndex === 0) {
                // Inhale task
                if (intensityDelta > 0 && isBreathingNow) {
                  breathDetectedRef.current = true;
                }
                if (
                  breathDetectedRef.current &&
                  breathIntensity < silenceThreshold
                ) {
                  startTaskTimer("inhale");
                  updateTaskProgress("inhale", true);
                } else {
                  updateTaskProgress("inhale", false);
                }
              } else if (currentTaskIndex === 1) {
                // Exhale task
                if (intensityDelta < 0 && isBreathingNow) {
                  breathDetectedRef.current = true;
                }
                if (
                  breathDetectedRef.current &&
                  breathIntensity < silenceThreshold
                ) {
                  startTaskTimer("exhale");
                  updateTaskProgress("exhale", true);
                } else {
                  updateTaskProgress("exhale", false);
                }
              }
            }

            previousIntensityRef.current = breathIntensity;
          },
        });

        analyzerRef.current.start();
      } catch (err) {
        console.error(err);
        setErrorMessage(
          "Unable to access the microphone. Please ensure you have granted permission."
        );
      }
    };

    if (
      (permissionStatus === "granted" || hasUserInteracted) &&
      permissionStatus !== "denied"
    ) {
      initializeAudio();
    }

    return () => {
      active = false;
      if (analyzerRef.current) {
        analyzerRef.current.stop();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [
    hasUserInteracted,
    permissionStatus,
    isCalibrating,
    breathThreshold,
    silenceThreshold,
    currentTaskIndex,
  ]);

  const tasks = [
    {
      name: "Take a deep breath and hold for 3 seconds",
      completed: isInhaleCompleted,
      progress: inhaleProgress,
    },
    {
      name: "Exhale and hold for 3 seconds",
      completed: isExhaleCompleted,
      progress: exhaleProgress,
    },
  ];

  return (
    <div className={styles.cmp}>
      <h2 className={styles.title}>
        Please complete the following breathing exercises:
      </h2>
      <ul className={styles.list}>
        {tasks.map((task, index) => (
          <li
            key={index}
            className={`${styles.task} ${
              task.completed ? styles.taskCompleted : ""
            } ${index === currentTaskIndex ? styles.taskActive : ""} ${
              index > currentTaskIndex ? styles.taskInactive : ""
            }`}
          >
            <span className={styles.icon}>
              {task.completed ? "✅" : index === currentTaskIndex ? "🔵" : "⚪"}
            </span>
            <span className={styles.text}>{task.name}</span>
            <ProgressBar progress={task.progress} />
          </li>
        ))}
      </ul>

      {permissionStatus === "prompt" && !hasUserInteracted && (
        <button
          className={styles.startButton}
          onClick={() => setHasUserInteracted(true)}
        >
          Allow microphone access
        </button>
      )}

      {permissionStatus === "denied" && (
        <div className={styles.error}>
          Microphone access has been denied. Please enable it in your browser
          settings.
        </div>
      )}

      {errorMessage && <div className={styles.error}>{errorMessage}</div>}

      <div className={styles.breathVisualizer}>
        <div
          className={`${styles.breathIndicator} ${
            isBreathing ? styles.breathing : ""
          }`}
          style={{ transform: `scale(${1 + breathIntensity * 5})` }}
        ></div>
      </div>

      <div className={styles.breathIntensity}>
        Breath Intensity: {breathIntensity.toFixed(4)}
      </div>
      <div className={styles.thresholds}>
        Breath Threshold: {breathThreshold.toFixed(4)}
        <br />
        Silence Threshold: {silenceThreshold.toFixed(4)}
      </div>
      <button
        className={styles.calibrateButton}
        onClick={calibrate}
        disabled={isCalibrating}
      >
        {isCalibrating ? "Calibrating..." : "Calibrate"}
      </button>
    </div>
  );
};

export default Breath;
