"use client";

import React, { useEffect, useRef, useState } from "react";
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

const HeadMovementComponent: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [headTurnedRight, setHeadTurnedRight] = useState(false);
  const [headTurnedLeft, setHeadTurnedLeft] = useState(false);
  const [mouthOpened, setMouthOpened] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const MOUTH_OPEN_THRESHOLD = 0.04;

  useEffect(() => {
    let camera: cam.Camera | null = null;

    const onResults = (results: Results) => {
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

          const leftEyeToNoseX = Math.abs(noseTip.x - leftEye.x);
          const rightEyeToNoseX = Math.abs(noseTip.x - rightEye.x);

          if (rightEyeToNoseX > leftEyeToNoseX + 0.1) {
            setHeadTurnedRight(true);
          } else if (leftEyeToNoseX > rightEyeToNoseX + 0.1) {
            setHeadTurnedLeft(true);
          }

          const upperLip = landmarks[13];
          const lowerLip = landmarks[14];

          const mouthOpenDistance = lowerLip.y - upperLip.y;
          if (mouthOpenDistance > MOUTH_OPEN_THRESHOLD) {
            setMouthOpened(true);
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
      camera = new cam.Camera(videoRef.current, {
        onFrame: async () => {
          await faceMesh.send({ image: videoRef.current! });
        },
        width: 640,
        height: 480,
      });
      camera.start();
    }

    return () => {
      if (camera) {
        camera.stop();
      }
    };
  }, [isInitialized]);

  const tasks = [
    { name: "Turn your head to the right", completed: headTurnedRight },
    { name: "Turn your head to the left", completed: headTurnedLeft },
    { name: "Open your mouth wide", completed: mouthOpened },
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
            })}
          >
            <span className={styles.icon}>{task.completed ? "✅" : "⬜"}</span>
            <span className={styles.text}>{task.name}</span>
          </li>
        ))}
      </ul>

      {!isInitialized && <div className={styles.loader}>Loading... ⏳</div>}

      <div className={styles.view}>
        <video ref={videoRef} className={styles.video} autoPlay muted />
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
      </div>
    </div>
  );
};

export default HeadMovementComponent;
