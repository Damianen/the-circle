"use client";

import React, { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";

export default function StreamerPage() {
	const localVideoRef = useRef<HTMLVideoElement>(null);
	const [wsOpen, setWsOpen] = useState(false);
	const [warning, setWarning] = useState("");
	const [isPaused, setIsPaused] = useState(false);
	const [currentCamera, setCurrentCamera] = useState<"user" | "environment">(
		"user"
	);
	const [localStream, setLocalStream] = useState<MediaStream | null>(null);
	const [peers, setPeers] = useState<Map<string, RTCPeerConnection>>(
		new Map()
	);
	const [blankVideoTrack, setBlankVideoTrack] =
		useState<MediaStreamTrack | null>(null);
	const [blankAudioTrack, setBlankAudioTrack] =
		useState<MediaStreamTrack | null>(null);
	const pauseOverlayRef = useRef<HTMLDivElement>(null);
	const id = useRef(uuidv4());
	const streamId = `stream-${id.current}`;
	const socketRef = useRef<WebSocket | null>(null);

	// Helper functions for blank tracks
	async function createBlankVideoTrack() {
		const canvas = document.createElement("canvas");
		canvas.width = 640;
		canvas.height = 480;
		const ctx = canvas.getContext("2d");
		ctx!.fillStyle = "#000000";
		ctx!.fillRect(0, 0, canvas.width, canvas.height);
		const stream = canvas.captureStream();
		return stream.getVideoTracks()[0];
	}
	async function createBlankAudioTrack() {
		const ctx = new window.AudioContext();
		const oscillator = ctx.createOscillator();
		const dest = ctx.createMediaStreamDestination();
		oscillator.connect(dest);
		oscillator.start();
		const track = dest.stream.getAudioTracks()[0];
		track.enabled = false;
		return track;
	}

	// WebSocket setup
	useEffect(() => {
		// Warn if not HTTPS or localhost
		if (
			window.location.protocol !== "https:" &&
			window.location.hostname !== "localhost" &&
			window.location.hostname !== "127.0.0.1"
		) {
			setWarning(
				"⚠️ Camera/mic access will NOT work over HTTP from a remote host.\n" +
					"Browsers require HTTPS or localhost for camera/mic access."
			);
		}
		const wsProtocol =
			window.location.protocol === "https:" ? "wss:" : "ws:";
		const wsHost = window.location.hostname;
		const wsPort = 3000;
		const wsUrl = `${wsProtocol}//${wsHost}:${wsPort}`;
		const socket = new window.WebSocket(wsUrl);
		socketRef.current = socket;

		socket.onopen = () => {
			setWsOpen(true);
			setWarning("");
		};
		socket.onclose = (e) => {
			setWsOpen(false);
			if (e.code === 1015) {
				window.location.href = `https://${wsHost}:${wsPort}/streamer`;
				return;
			}
			setWarning(
				`WebSocket connection to signaling server closed.\nURL: ${wsUrl}\nCode: ${e.code} Reason: ${e.reason}`
			);
		};
		socket.onerror = (e) => {
			setWsOpen(false);
			setWarning(
				`WebSocket connection error. Check your server and network. URL: ${wsUrl}`
			);
		};
		return () => {
			socket.close();
		};
	}, []);

	// Handle incoming WebSocket messages
	useEffect(() => {
		const socket = socketRef.current;
		if (!socket) return;
		const handleMessage = async (event: MessageEvent) => {
			const msg = JSON.parse(event.data);
			if (msg.type === "viewer-joined") {
				const viewerId = msg.viewerId;
				if (peers.has(viewerId)) return;
				const peer = new RTCPeerConnection();
				localStream
					?.getTracks()
					.forEach((track) => peer.addTrack(track, localStream));
				peer.onicecandidate = (e) => {
					if (e.candidate) {
						socket.send(
							JSON.stringify({
								type: "ice-candidate",
								to: viewerId,
								candidate: e.candidate,
							})
						);
					}
				};
				peer.onconnectionstatechange = () => {
					// Optionally handle connection state
				};
				const offer = await peer.createOffer();
				await peer.setLocalDescription(offer);
				socket.send(
					JSON.stringify({
						type: "offer",
						to: viewerId,
						offer,
					})
				);
				setPeers((prev) => new Map(prev).set(viewerId, peer));
			} else if (msg.type === "answer") {
				const viewerId = msg.from;
				const peer = peers.get(viewerId);
				if (peer) {
					await peer.setRemoteDescription(
						new RTCSessionDescription(msg.answer)
					);
				}
			} else if (msg.type === "ice-candidate") {
				const viewerId = msg.from;
				const peer = peers.get(viewerId);
				if (peer && msg.candidate) {
					try {
						await peer.addIceCandidate(
							new RTCIceCandidate(msg.candidate)
						);
					} catch (e) {
						// Optionally handle error
					}
				}
			}
		};
		socket.addEventListener("message", handleMessage);
		return () => {
			socket.removeEventListener("message", handleMessage);
		};
	}, [localStream, peers]);

	// Create blank tracks on mount
	useEffect(() => {
		createBlankVideoTrack().then(setBlankVideoTrack);
		createBlankAudioTrack().then(setBlankAudioTrack);
	}, []);

	// Start stream
	const handleStart = async () => {
		if (!wsOpen) {
			setWarning("WebSocket not connected. Cannot start stream.");
			return;
		}
		if (
			!navigator.mediaDevices ||
			typeof navigator.mediaDevices.getUserMedia !== "function"
		) {
			setWarning("Camera/mic not supported on this device or browser.");
			return;
		}
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: currentCamera },
				audio: true,
			});
			setLocalStream(stream);
			if (localVideoRef.current) {
				localVideoRef.current.srcObject = stream;
			}
			socketRef.current?.send(
				JSON.stringify({
					type: "register",
					id: id.current,
					clientType: "streamer",
					streamId,
				})
			);
		} catch (err: any) {
			setWarning("Could not access camera/mic: " + err.message);
		}
	};

	// Stop stream
	const handleStop = () => {
		socketRef.current?.send(
			JSON.stringify({ type: "stream-ended", streamId })
		);
		peers.forEach((peer, viewerId) => {
			peer.close();
		});
		setPeers(new Map());
		if (localStream) {
			localStream.getTracks().forEach((t) => t.stop());
			if (localVideoRef.current) localVideoRef.current.srcObject = null;
			setLocalStream(null);
		}
		setIsPaused(false);
	};

	// Flip camera
	const handleFlip = async () => {
		const newCamera = currentCamera === "user" ? "environment" : "user";
		setCurrentCamera(newCamera);
		try {
			const newStream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: newCamera },
				audio: true,
			});
			const videoTrack = newStream.getVideoTracks()[0];
			peers.forEach((peer) => {
				const sender = peer
					.getSenders()
					.find((s) => s.track && s.track.kind === "video");
				if (sender) sender.replaceTrack(videoTrack);
			});
			if (localStream) localStream.getVideoTracks()[0].stop();
			setLocalStream(newStream);
			if (localVideoRef.current)
				localVideoRef.current.srcObject = newStream;
		} catch (err: any) {
			setWarning("Failed to flip camera: " + err.message);
		}
	};

	// Pause/resume stream
	const handlePause = async () => {
		if (!isPaused) {
			// Pause: replace tracks with blank
			peers.forEach((peer) => {
				peer.getSenders().forEach((sender) => {
					if (
						sender.track &&
						sender.track.kind === "video" &&
						blankVideoTrack
					) {
						sender.replaceTrack(blankVideoTrack);
					} else if (
						sender.track &&
						sender.track.kind === "audio" &&
						blankAudioTrack
					) {
						sender.replaceTrack(blankAudioTrack);
					}
				});
			});
			if (localVideoRef.current && blankVideoTrack) {
				localVideoRef.current.srcObject = new MediaStream([
					blankVideoTrack,
				]);
			}
		} else {
			// Resume: restore original tracks
			if (localStream) {
				const videoTrack = localStream.getVideoTracks()[0];
				const audioTrack = localStream.getAudioTracks()[0];
				peers.forEach((peer) => {
					peer.getSenders().forEach((sender) => {
						if (sender.track && sender.track.kind === "video") {
							sender.replaceTrack(videoTrack);
						} else if (
							sender.track &&
							sender.track.kind === "audio"
						) {
							sender.replaceTrack(audioTrack);
						}
					});
				});
				if (localVideoRef.current)
					localVideoRef.current.srcObject = localStream;
			}
		}
		setIsPaused(!isPaused);
	};

	// Clean up on unmount
	useEffect(() => {
		return () => {
			socketRef.current?.close();
			handleStop();
		};
		// eslint-disable-next-line
	}, []);

	return (
		<div style={{ maxWidth: 600, margin: "2rem auto", padding: 20 }}>
			<h2>Streamer</h2>
			<div style={{ display: "flex", gap: 10, marginBottom: 15 }}>
				<button onClick={handleStart} disabled={!!localStream}>
					Start Stream
				</button>
				<button onClick={handleStop} disabled={!localStream}>
					Stop Stream
				</button>
				<button onClick={handlePause} disabled={!localStream}>
					{isPaused ? "Resume Stream" : "Pause Stream"}
				</button>
				<button onClick={handleFlip} disabled={!localStream}>
					Flip Camera
				</button>
			</div>
			<div
				style={{
					position: "relative",
					width: "100%",
					margin: "20px 0",
				}}
			>
				<video
					ref={localVideoRef}
					autoPlay
					muted
					playsInline
					style={{
						width: "100%",
						maxHeight: "80vh",
						objectFit: "cover",
						background: "#000",
						borderRadius: 8,
					}}
				/>
				{isPaused && (
					<div
						ref={pauseOverlayRef}
						style={{
							display: "flex",
							position: "absolute",
							top: 0,
							left: 0,
							right: 0,
							bottom: 0,
							background: "rgba(0,0,0,0.8)",
							color: "white",
							justifyContent: "center",
							alignItems: "center",
							fontSize: 24,
							borderRadius: 8,
						}}
					>
						Stream Paused
					</div>
				)}
			</div>
			{warning && (
				<div style={{ color: "#ff0000", marginTop: 10 }}>{warning}</div>
			)}
		</div>
	);
}
