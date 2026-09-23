package com.spark.vectorstrike;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.webkit.JavascriptInterface;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketException;
import java.util.Collections;
import java.util.List;
import java.net.NetworkInterface;

public class AndroidBridge {
    private static final int DISCOVERY_PORT = 47650;
    private static final int TCP_PORT = 47651;

    private final MainActivity activity;
    private final Vibrator vibrator;
    private final SharedPreferences prefs;

    private volatile boolean lanRunning = false;
    private ServerSocket serverSocket;
    private DatagramSocket discoverySocket;
    private final java.util.Set<Socket> clients =
        Collections.synchronizedSet(new java.util.HashSet<>());
    private final java.util.Set<BufferedWriter> writers =
        Collections.synchronizedSet(new java.util.HashSet<>());

    public AndroidBridge(MainActivity activity) {
        this.activity = activity;
        this.vibrator = (Vibrator) activity.getSystemService(Context.VIBRATOR_SERVICE);
        this.prefs = activity.getSharedPreferences("VectorStrikeSettings", Context.MODE_PRIVATE);
    }

    @JavascriptInterface
    public void vibrate(long milliseconds) {
        if (vibrator != null && vibrator.hasVibrator()) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createOneShot(milliseconds, VibrationEffect.DEFAULT_AMPLITUDE));
            } else {
                vibrator.vibrate(milliseconds);
            }
        }
    }

    @JavascriptInterface
    public String getDeviceIp() {
        try {
            List<NetworkInterface> interfaces = Collections.list(NetworkInterface.getNetworkInterfaces());
            for (NetworkInterface intf : interfaces) {
                List<InetAddress> addrs = Collections.list(intf.getInetAddresses());
                for (InetAddress addr : addrs) {
                    if (!addr.isLoopbackAddress() && !addr.isLinkLocalAddress()) {
                        String sAddr = addr.getHostAddress();
                        if (sAddr != null && sAddr.indexOf(':') < 0) return sAddr;
                    }
                }
            }
        } catch (Exception ignored) {}
        return "127.0.0.1";
    }

    @JavascriptInterface
    public synchronized void startLanHost(final String roomCode) {
        stopLan();
        lanRunning = true;

        new Thread(() -> {
            try {
                serverSocket = new ServerSocket(TCP_PORT);
                while (lanRunning) {
                    final Socket socket = serverSocket.accept();
                    if (!lanRunning) break;
                    clients.add(socket);
                    final BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(socket.getOutputStream()));
                    writers.add(writer);
                    new Thread(() -> readClient(socket, writer), "VS-LAN-client").start();
                }
            } catch (Exception e) {
                if (lanRunning) {
                    activity.dispatchLanStatus("ERROR:" + e.getClass().getSimpleName());
                }
            }
        }, "VS-LAN-server").start();

        new Thread(() -> discoveryLoop(roomCode), "VS-LAN-discovery").start();
        activity.dispatchLanStatus("HOSTING");
    }

    private void discoveryLoop(String roomCode) {
        try {
            discoverySocket = new DatagramSocket(DISCOVERY_PORT);
            discoverySocket.setBroadcast(true);
            byte[] buf = new byte[256];

            while (lanRunning) {
                DatagramPacket packet = new DatagramPacket(buf, buf.length);
                discoverySocket.receive(packet);
                String msg = new String(packet.getData(), packet.getOffset(), packet.getLength(), java.nio.charset.StandardCharsets.UTF_8);
                String prefix = "VECTOR_STRIKE_DISCOVER|";
                if (msg.startsWith(prefix) && roomCode.equals(msg.substring(prefix.length()).trim())) {
                    String response = "VECTOR_STRIKE_HOST|" + roomCode + "|" + getDeviceIp() + "|" + TCP_PORT;
                    byte[] out = response.getBytes(java.nio.charset.StandardCharsets.UTF_8);
                    DatagramPacket reply = new DatagramPacket(out, out.length, packet.getAddress(), packet.getPort());
                    discoverySocket.send(reply);
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (discoverySocket != null) {
                discoverySocket.close();
                discoverySocket = null;
            }
        }
    }

    @JavascriptInterface
    public synchronized void joinLanRoom(final String roomCode) {
        stopLan();
        lanRunning = true;

        new Thread(() -> {
            DatagramSocket ds = null;
            try {
                ds = new DatagramSocket();
                ds.setBroadcast(true);
                ds.setSoTimeout(1800);

                String discovery = "VECTOR_STRIKE_DISCOVER|" + roomCode.toUpperCase();
                byte[] data = discovery.getBytes(java.nio.charset.StandardCharsets.UTF_8);

                // Send several broadcasts so phones that wake slowly still have a chance to answer.
                for (int i = 0; i < 3 && lanRunning; i++) {
                    DatagramPacket p = new DatagramPacket(
                        data, data.length, InetAddress.getByName("255.255.255.255"), DISCOVERY_PORT);
                    ds.send(p);

                    try {
                        byte[] buf = new byte[512];
                        DatagramPacket reply = new DatagramPacket(buf, buf.length);
                        ds.receive(reply);
                        String msg = new String(reply.getData(), reply.getOffset(), reply.getLength(),
                            java.nio.charset.StandardCharsets.UTF_8);
                        String[] parts = msg.split("\\|");
                        if (parts.length >= 4 && "VECTOR_STRIKE_HOST".equals(parts[0])
                                && roomCode.equalsIgnoreCase(parts[1])) {
                            connectTcp(reply.getAddress().getHostAddress(), Integer.parseInt(parts[3]));
                            return;
                        }
                    } catch (java.net.SocketTimeoutException ignored) {}
                }
                activity.dispatchLanStatus("ERROR:ROOM_NOT_FOUND");
            } catch (Exception e) {
                activity.dispatchLanStatus("ERROR:" + e.getClass().getSimpleName());
            } finally {
                if (ds != null) ds.close();
            }
        }, "VS-LAN-join").start();
    }

    private void connectTcp(String host, int port) {
        try {
            Socket socket = new Socket(host, port);
            clients.add(socket);
            BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(socket.getOutputStream()));
            writers.add(writer);
            activity.dispatchLanStatus("CONNECTED");
            new Thread(() -> readClient(socket, writer), "VS-LAN-host-connection").start();
        } catch (Exception e) {
            activity.dispatchLanStatus("ERROR:CONNECT_FAILED");
        }
    }

    private void readClient(Socket socket, BufferedWriter writer) {
        try {
            BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream()));
            String line;
            while (lanRunning && (line = reader.readLine()) != null) {
                activity.dispatchLanMessage(line);
                broadcast(line);
            }
        } catch (Exception ignored) {
        } finally {
            writers.remove(writer);
            clients.remove(socket);
            try { socket.close(); } catch (Exception ignored) {}
        }
    }

    @JavascriptInterface
    public void sendLanMessage(String json) {
        if (!lanRunning || json == null) return;
        broadcast(json);
    }

    private void broadcast(String json) {
        synchronized (writers) {
            java.util.Iterator<BufferedWriter> it = writers.iterator();
            while (it.hasNext()) {
                BufferedWriter writer = it.next();
                try {
                    writer.write(json);
                    writer.newLine();
                    writer.flush();
                } catch (Exception e) {
                    it.remove();
                }
            }
        }
    }

    @JavascriptInterface
    public synchronized void stopLan() {
        lanRunning = false;
        try { if (serverSocket != null) serverSocket.close(); } catch (Exception ignored) {}
        try { if (discoverySocket != null) discoverySocket.close(); } catch (Exception ignored) {}
        serverSocket = null;
        discoverySocket = null;

        synchronized (clients) {
            for (Socket socket : clients) {
                try { socket.close(); } catch (Exception ignored) {}
            }
            clients.clear();
        }
        writers.clear();
    }

    @JavascriptInterface
    public void saveSetting(String key, String value) {
        prefs.edit().putString(key, value).apply();
    }

    @JavascriptInterface
    public String getSetting(String key, String defaultValue) {
        return prefs.getString(key, defaultValue);
    }

    @JavascriptInterface
    public void exitGame() {
        activity.runOnUiThread(activity::finish);
    }
}
