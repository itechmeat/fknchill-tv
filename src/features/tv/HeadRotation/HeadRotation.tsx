"use client";

import React, { FC, useEffect, useRef, useState } from "react";
import {
  FaceMesh,
  Results,
  NormalizedLandmarkList,
} from "@mediapipe/face_mesh";
import * as cam from "@mediapipe/camera_utils";
import { drawConnectors } from "@mediapipe/drawing_utils";
import { FACEMESH_TESSELATION } from "@mediapipe/face_mesh";
import cn from "classnames";
import styles from "./HeadRotation.module.scss";

const ProgressBar: React.FC<{ progress: number }> = ({ progress }) => (
  <div className={styles.progressBar}>
    <div className={styles.progressFill} style={{ width: `${progress}%` }} />
  </div>
);

const HeadRotation: FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isRightTurnCompleted, setIsRightTurnCompleted] = useState(false);
  const [isLeftTurnCompleted, setIsLeftTurnCompleted] = useState(false);
  const [isMouthOpenCompleted, setIsMouthOpenCompleted] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [leftRotation, setLeftRotation] = useState(0);
  const [rightRotation, setRightRotation] = useState(0);
  const [mouthOpenness, setMouthOpenness] = useState(0);
  const [rightTurnProgress, setRightTurnProgress] = useState(0);
  const [leftTurnProgress, setLeftTurnProgress] = useState(0);
  const [mouthOpenProgress, setMouthOpenProgress] = useState(0);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [permissionStatus, setPermissionStatus] =
    useState<PermissionState | null>(null);

  const taskStartTimeRef = useRef<{ [key: string]: number }>({});

  const MOUTH_OPEN_THRESHOLD = 0.04;
  const MAX_HEAD_ROTATION = 0.2;
  const HEAD_TURN_THRESHOLD_PERCENTAGE = 15;
  const MOUTH_OPEN_THRESHOLD_PERCENTAGE = 40;
  const TASK_COMPLETION_TIME_MS = 3000;

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
        case "turnRight":
          setRightTurnProgress(0);
          break;
        case "turnLeft":
          setLeftTurnProgress(0);
          break;
        case "openMouth":
          setMouthOpenProgress(0);
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
        case "turnRight":
          setRightTurnProgress(progress);
          if (progress === 100) {
            setIsRightTurnCompleted(true);
            setCurrentTaskIndex(1);
          }
          break;
        case "turnLeft":
          setLeftTurnProgress(progress);
          if (progress === 100) {
            setIsLeftTurnCompleted(true);
            setCurrentTaskIndex(2);
          }
          break;
        case "openMouth":
          setMouthOpenProgress(progress);
          if (progress === 100) {
            setIsMouthOpenCompleted(true);
            setCurrentTaskIndex(3);
          }
          break;
      }
    }
  };

  const getTaskName = (index: number): string => {
    switch (index) {
      case 0:
        return "turnRight";
      case 1:
        return "turnLeft";
      case 2:
        return "openMouth";
      default:
        return "";
    }
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
            name: "camera" as PermissionName,
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
    let camera: cam.Camera | null = null;
    let active = true;

    const isIOS = () => {
      if (typeof navigator !== "undefined" && typeof window !== "undefined") {
        return (
          ["iPad", "iPhone", "iPod"].includes(navigator.platform) ||
          (navigator.userAgent.includes("Mac") && "ontouchend" in document)
        );
      }
      return false;
    };

    const onResults = (results: Results) => {
      if (!active) return;
      if (canvasRef.current && videoRef.current) {
        const canvasElement = canvasRef.current;
        const canvasCtx = canvasElement.getContext("2d")!;
        const videoWidth = videoRef.current.videoWidth;
        const videoHeight = videoRef.current.videoHeight;

        canvasElement.width = videoWidth;
        canvasElement.height = videoHeight;

        canvasCtx.save();
        canvasCtx.clearRect(0, 0, videoWidth, videoHeight);
        canvasCtx.drawImage(results.image, 0, 0, videoWidth, videoHeight);

        if (
          results.multiFaceLandmarks &&
          results.multiFaceLandmarks.length > 0
        ) {
          const landmarks: NormalizedLandmarkList =
            results.multiFaceLandmarks[0];

          const leftEye = landmarks[33];
          const rightEye = landmarks[263];
          const noseTip = landmarks[1];

          const eyeMidpoint = {
            x: (leftEye.x + rightEye.x) / 2,
            y: (leftEye.y + rightEye.y) / 2,
          };
          const rotationX = noseTip.x - eyeMidpoint.x;

          const normalizedRotation =
            Math.abs(rotationX / MAX_HEAD_ROTATION) * 100;
          const clampedRotation = Math.min(100, normalizedRotation);

          const isLeftTurn = rotationX > 0;
          const isRightTurn = rotationX < 0;

          setLeftRotation(isLeftTurn ? clampedRotation : 0);
          setRightRotation(isRightTurn ? clampedRotation : 0);

          if (
            currentTaskIndex === 0 &&
            isRightTurn &&
            clampedRotation > HEAD_TURN_THRESHOLD_PERCENTAGE
          ) {
            startTaskTimer("turnRight");
            updateTaskProgress("turnRight", true);
          } else if (
            currentTaskIndex === 1 &&
            isLeftTurn &&
            clampedRotation > HEAD_TURN_THRESHOLD_PERCENTAGE
          ) {
            startTaskTimer("turnLeft");
            updateTaskProgress("turnLeft", true);
          } else {
            updateTaskProgress("turnRight", false);
            updateTaskProgress("turnLeft", false);
          }

          const upperLip = landmarks[13];
          const lowerLip = landmarks[14];
          const mouthOpenDistance = lowerLip.y - upperLip.y;
          const calculatedMouthOpenness = Math.min(
            (mouthOpenDistance / MOUTH_OPEN_THRESHOLD) * 100,
            100
          );
          setMouthOpenness(calculatedMouthOpenness);

          if (
            currentTaskIndex === 2 &&
            calculatedMouthOpenness > MOUTH_OPEN_THRESHOLD_PERCENTAGE
          ) {
            startTaskTimer("openMouth");
            updateTaskProgress("openMouth", true);
          } else {
            updateTaskProgress("openMouth", false);
          }

          drawConnectors(canvasCtx, landmarks, FACEMESH_TESSELATION, {
            color: "#C0C0C070",
            lineWidth: 1,
          });
        }
        canvasCtx.restore();

        if (!isInitialized) {
          setIsInitialized(true);
        }
      }
    };

    const initializeCamera = async () => {
      const faceMesh = new FaceMesh({
        locateFile: (file: string) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
      });

      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      faceMesh.onResults(onResults);

      if (videoRef.current) {
        try {
          if (isIOS()) {
            // For iOS devices, create a custom video stream
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: {
                facingMode: "user",
              },
            });
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
            const onFrame = async () => {
              if (!active) return;
              await faceMesh.send({ image: videoRef.current! });
              requestAnimationFrame(onFrame);
            };
            onFrame();
          } else {
            // For other devices, use MediaPipe's camera utils
            camera = new cam.Camera(videoRef.current, {
              onFrame: async () => {
                await faceMesh.send({ image: videoRef.current! });
              },
              width: 640,
              height: 480,
            });
            camera.start();
          }
        } catch (err) {
          console.error(err);
          setErrorMessage(
            "Unable to access the camera. Please ensure you have granted permission."
          );
        }
      }
    };

    if (
      (permissionStatus === "granted" || hasUserInteracted) &&
      permissionStatus !== "denied"
    ) {
      initializeCamera();
    }

    return () => {
      active = false;
      if (camera) {
        camera.stop();
      }
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach((track) => track.stop());
      }
    };
  }, [isInitialized, currentTaskIndex, hasUserInteracted, permissionStatus]);

  const tasks = [
    {
      name: "Turn your head to the right",
      completed: isRightTurnCompleted,
      progress: isRightTurnCompleted ? 100 : rightTurnProgress,
    },
    {
      name: "Turn your head to the left",
      completed: isLeftTurnCompleted,
      progress: isLeftTurnCompleted ? 100 : leftTurnProgress,
    },
    {
      name: "Open your mouth wide",
      completed: isMouthOpenCompleted,
      progress: isMouthOpenCompleted ? 100 : mouthOpenProgress,
    },
  ];

  return (
    <div className={styles.cmp}>
      <h2 className={styles.title}>Please complete the following tasks:</h2>
      <ul className={styles.list}>
        {tasks.map((task, index) => (
          <li
            key={index}
            className={cn(styles.task, {
              [styles.taskCompleted]: task.completed,
              [styles.taskActive]: index === currentTaskIndex,
              [styles.taskInactive]: index > currentTaskIndex,
            })}
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
          Allow camera access
        </button>
      )}

      {permissionStatus === "denied" && (
        <div className={styles.error}>
          Camera access has been denied. Please enable it in your browser
          settings.
        </div>
      )}

      {!isInitialized &&
        (hasUserInteracted || permissionStatus === "granted") && (
          <div className={styles.loader}>Loading... ⏳</div>
        )}
      {errorMessage && <div className={styles.error}>{errorMessage}</div>}

      <div className={styles.view}>
        <video
          ref={videoRef}
          className={styles.video}
          autoPlay
          muted
          playsInline
        />
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: "100%",
            height: "100%",
          }}
        />
        {isInitialized && (
          <div className={styles.indicators}>
            <p>Head Rotation Left: {leftRotation.toFixed(0)}%</p>
            <p>Head Rotation Right: {rightRotation.toFixed(0)}%</p>
            <p>Mouth Openness: {mouthOpenness.toFixed(0)}%</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default HeadRotation;
