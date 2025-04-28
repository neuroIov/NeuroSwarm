import { GPUDevice, GPUAdapter, GPUBuffer, GPUShaderModule, GPUComputePipeline, GPUBindGroup } from './GPUCompute';

interface ComputeCapabilities {
    webgpu: boolean;
    webgl2: boolean;
    wasm: boolean;
    cpu: boolean;
}

interface ComputeMetrics {
    executionTime: number;
    memoryUsage: number;
    success: boolean;
    error?: string;
}

interface ComputeFallback {
    compute: (data: Float32Array, shader: string) => Promise<Float32Array>;
    getDeviceInfo: () => Promise<Record<string, unknown>>;
    getMaxComputeUnits: () => number;
    getCapabilities: () => ComputeCapabilities;
    getMetrics: () => ComputeMetrics;
}

export class WebGPUCompute {
    private device: GPUDevice | null = null;
    private adapter: GPUAdapter | null = null;
    private fallback: ComputeFallback | null = null;
    private capabilities: ComputeCapabilities = {
        webgpu: false,
        webgl2: false,
        wasm: false,
        cpu: true
    };
    private lastMetrics: ComputeMetrics = {
        executionTime: 0,
        memoryUsage: 0,
        success: false
    };


    constructor() {
        void this.initialize();
    }

    private async initialize(): Promise<void> {
        try {
            // Try WebGPU
            if ('gpu' in navigator) {
                this.adapter = await (navigator as any).gpu.requestAdapter({
                    powerPreference: 'high-performance'
                });
                if (this.adapter) {
                    this.device = await this.adapter.requestDevice();
                    if (this.device) {
                        this.capabilities.webgpu = true;
                        console.log('WebGPU initialized successfully');
                        return;
                    }
                }
            }

            // Try WebGL2
            console.warn('WebGPU not available, attempting WebGL2 fallback');
            if (this.isWebGL2Supported()) {
                this.fallback = await this.setupWebGL2Fallback();
                if (this.fallback) {
                    this.capabilities.webgl2 = true;
                    console.log('WebGL2 fallback initialized successfully');
                    return;
                }
            }

            // Try WASM
            console.warn('WebGL2 not available, attempting WASM fallback');
            this.fallback = await this.setupWasmFallback();
            if (this.fallback) {
                this.capabilities.wasm = true;
                console.log('WASM fallback initialized successfully');
                return;
            }

            // CPU fallback as last resort
            console.warn('All GPU options failed, falling back to CPU');
            this.fallback = await this.setupCPUFallback();
            this.capabilities.cpu = true;
            console.log('CPU fallback initialized');
            
        } catch (error) {
            console.error('Compute initialization failed:', error);
            // Ensure CPU fallback is always available
            this.fallback = await this.setupCPUFallback();
            this.capabilities.cpu = true;
            this.lastMetrics.error = error instanceof Error ? error.message : 'Unknown error';
        }
    }

    private async setupWebGL2Fallback(): Promise<ComputeFallback> {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2');

        if (!gl) {
            throw new Error('WebGL2 compute not supported');
        }

        const ext = gl.getExtension('EXT_color_buffer_float');
        if (!ext) {
            throw new Error('EXT_color_buffer_float not supported');
        }

        return {
            compute: async (data: Float32Array, shader: string): Promise<Float32Array> => {
                const startTime = performance.now();
                try {
                    // Create compute shader
                    const computeShader = gl.createShader(gl.COMPUTE_SHADER);
                    if (!computeShader) throw new Error('Failed to create compute shader');

                    gl.shaderSource(computeShader, shader);
                    gl.compileShader(computeShader);

                    if (!gl.getShaderParameter(computeShader, gl.COMPILE_STATUS)) {
                        throw new Error(`Shader compilation failed: ${gl.getShaderInfoLog(computeShader)}`);
                    }

                    // Create program and buffers
                    const program = gl.createProgram();
                    if (!program) throw new Error('Failed to create program');

                    gl.attachShader(program, computeShader);
                    gl.linkProgram(program);

                    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                        throw new Error(`Program linking failed: ${gl.getProgramInfoLog(program)}`);
                    }

                    // Set up buffers and compute
                    const buffer = gl.createBuffer();
                    gl.bindBuffer(gl.SHADER_STORAGE_BUFFER, buffer);
                    gl.bufferData(gl.SHADER_STORAGE_BUFFER, data, gl.STATIC_DRAW);

                    gl.useProgram(program);
                    // Use fragment shader for computation instead of compute shader
                    gl.drawArrays(gl.TRIANGLES, 0, 3);

                    // Read back results
                    const result = new Float32Array(data.length);
                    gl.getBufferSubData(gl.SHADER_STORAGE_BUFFER, 0, result);

                    this.lastMetrics = {
                        executionTime: performance.now() - startTime,
                        memoryUsage: data.length * 4,
                        success: true
                    };

                    return result;
                } catch (error) {
                    this.lastMetrics = {
                        executionTime: performance.now() - startTime,
                        memoryUsage: 0,
                        success: false,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    };
                    throw error;
                }
            },
            getDeviceInfo: async () => ({
                type: 'webgl2',
                vendor: gl.getParameter(gl.VENDOR),
                renderer: gl.getParameter(gl.RENDERER),
                version: gl.getParameter(gl.VERSION)
            }),
            getMaxComputeUnits: () => {
                // WebGL2 doesn't have compute shaders, use a reasonable default
            const maxWorkGroups = 256;
                return maxWorkGroups || 256;
            },
            getCapabilities: () => this.capabilities,
            getMetrics: () => this.lastMetrics
        };
    }

    private async setupWasmFallback(): Promise<ComputeFallback> {
        try {
            // Load WASM module
            const wasmModule = await WebAssembly.compileStreaming(
                fetch('/assets/compute.wasm')
            ).catch(async (error) => {
                console.warn('WebAssembly streaming compilation failed:', error);
                console.log('Falling back to ArrayBuffer compilation...');
                try {
                    const response = await fetch('/assets/compute.wasm');
                    if (!response.ok) {
                        throw new Error(`Failed to fetch WASM module: ${response.status} ${response.statusText}`);
                    }
                    const bytes = await response.arrayBuffer();
                    return WebAssembly.compile(bytes);
                } catch (e) {
                    throw new Error(`Failed to load WASM module: ${e instanceof Error ? e.message : 'Unknown error'}`);
                }
            });
            const wasmInstance = await WebAssembly.instantiate(wasmModule);
            interface WasmExports {
                memory: WebAssembly.Memory;
                allocate: (size: number) => number;
                compute: (ptr: number, length: number) => void;
            }
            const exports = wasmInstance.exports as WasmExports;

            return {
                compute: async (data: Float32Array, shader: string): Promise<Float32Array> => {
                    const startTime = performance.now();
                    try {
                        // Allocate memory in WASM
                        const ptr = exports.allocate(data.length * 4);
                        new Float32Array(exports.memory.buffer).set(data, ptr / 4);

                        // Execute computation
                        exports.compute(ptr, data.length);

                        // Read results
                        const result = new Float32Array(
                            exports.memory.buffer,
                            ptr,
                            data.length
                        );

                        this.lastMetrics = {
                            executionTime: performance.now() - startTime,
                            memoryUsage: data.length * 4,
                            success: true
                        };

                        return result;
                    } catch (error) {
                        this.lastMetrics = {
                            executionTime: performance.now() - startTime,
                            memoryUsage: 0,
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        };
                        throw error;
                    }
                },
                getDeviceInfo: async () => ({
                    type: 'wasm',
                    version: '1.0',
                    features: ['SIMD', 'threads']
                }),
                getMaxComputeUnits: () => navigator.hardwareConcurrency || 4,
                getCapabilities: () => this.capabilities,
                getMetrics: () => this.lastMetrics
            };
        } catch (error) {
            console.error('WASM initialization failed:', error);
            throw error;
        }


    }

    private async setupCPUFallback(): Promise<ComputeFallback> {
        // CPU implementation using Web Workers for parallel processing
        const workerCode = `
            self.onmessage = function(e: MessageEvent<{data: Float32Array; shader: string}>) {
                const { data, shader } = e.data;
                try {
                    // Simple shader simulation
                    const result = new Float32Array(data.length);
                    for (let i = 0; i < data.length; i++) {
                        result[i] = Math.pow(data[i], 2); // Example operation
                    }
                    self.postMessage({ success: true, result });
                } catch (error) {
                    self.postMessage({ success: false, error: error.message });
                }
            };
        `;

        const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(workerBlob);
        const workers = Array.from({ length: navigator.hardwareConcurrency || 4 }, 
            () => new Worker(workerUrl));

        return {
            compute: async (data: Float32Array, shader: string): Promise<Float32Array> => {
                const startTime = performance.now();
                try {
                    const chunkSize = Math.ceil(data.length / workers.length);
                    const chunks = Array.from({ length: workers.length }, (_, i) => {
                        const start = i * chunkSize;
                        const end = Math.min(start + chunkSize, data.length);
                        return data.slice(start, end);
                    });

                    const results = await Promise.all(chunks.map((chunk, i) => new Promise((resolve, reject) => {
                        workers[i].onmessage = (e) => {
                            if (e.data.success) {
                                resolve(e.data.result);
                            } else {
                                reject(new Error(e.data.error));
                            }
                        };
                        workers[i].postMessage({ data: chunk, shader });
                    })));

                    const result = new Float32Array(data.length);
                    let offset = 0;
                    for (const chunk of results) {
                        result.set(chunk, offset);
                        offset += chunk.length;
                    }

                    this.lastMetrics = {
                        executionTime: performance.now() - startTime,
                        memoryUsage: data.length * 4,
                        success: true
                    };

                    return result;
                } catch (error) {
                    this.lastMetrics = {
                        executionTime: performance.now() - startTime,
                        memoryUsage: 0,
                        success: false,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    };
                    throw error;
                }
            },
            getDeviceInfo: async () => ({
                type: 'cpu',
                cores: navigator.hardwareConcurrency || 4,
                features: ['parallel-processing']
            }),
            getMaxComputeUnits: () => navigator.hardwareConcurrency || 4,
            getCapabilities: () => this.capabilities,
            getMetrics: () => this.lastMetrics
        };
    }

    }

    private isWebGL2Supported(): boolean {
        if (!window || !window.WebGL2RenderingContext) return false;
        try {
            const canvas = document.createElement('canvas');
            this.gl = canvas.getContext('webgl2');
            if (!this.gl) return false;

            // Check for required extensions
            const ext = this.gl.getExtension('EXT_color_buffer_float');
            if (!ext) {
                console.warn('EXT_color_buffer_float not supported');
                return false;
            }

            return true;
        } catch (error) {
            console.error('WebGL2 support check failed:', error);
            return false;
        }
    }

    public async compute(data: Float32Array, shader: string): Promise<Float32Array> {
        const startTime = performance.now();
        let result: Float32Array;

        try {
            if (this.device) {
                result = await this.webGPUCompute(data, shader);
            } else if (this.fallback) {
                result = await this.fallback.compute(data, shader);
            } else {
                throw new Error('No compute backend available');
            }

            this.recordPerformance('compute', performance.now() - startTime);
            return result;
        } catch (error) {
            console.error('Compute failed:', error);
            if (this.fallback) {
                result = await this.fallback.compute(data, shader);
                this.recordPerformance('fallback_compute', performance.now() - startTime);
                return result;
            }
            throw error;
        }
    }

    private async webGPUCompute(data: Float32Array, shader: string): Promise<Float32Array> {
        if (!this.device) throw new Error('WebGPU not initialized');

        const device = this.device;

        const inputBuffer = device.createBuffer({
            size: data.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(inputBuffer, 0, data);

        const outputBuffer = device.createBuffer({
            size: data.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
        });

        const shaderModule = device.createShaderModule({
            code: `
                @group(0) @binding(0) var<storage, read> input: array<f32>;
                @group(0) @binding(1) var<storage, read_write> output: array<f32>;

                @compute @workgroup_size(256)
                fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
                    let index = global_id.x;
                    if (index >= arrayLength(&input)) {
                        return;
                    }
                    ${shader}
                }
            `
        });

        const computePipeline = device.createComputePipeline({
            layout: 'auto',
            compute: { module: shaderModule, entryPoint: 'main' }
        });

        const bindGroup = device.createBindGroup({
            layout: computePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: inputBuffer } },
                { binding: 1, resource: { buffer: outputBuffer } }
            ]
        });

        const commandEncoder = device.createCommandEncoder();
        const passEncoder = commandEncoder.beginComputePass();
        passEncoder.setPipeline(computePipeline);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.dispatchWorkgroups(Math.ceil(data.length / 256));
        passEncoder.end();

        const readbackBuffer = device.createBuffer({
            size: data.byteLength,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });

        commandEncoder.copyBufferToBuffer(outputBuffer, 0, readbackBuffer, 0, data.byteLength);
        device.queue.submit([commandEncoder.finish()]);

        await readbackBuffer.mapAsync(GPUMapMode.READ);
        const resultData = new Float32Array(readbackBuffer.getMappedRange());
        readbackBuffer.unmap();

        inputBuffer.destroy();
        outputBuffer.destroy();
        readbackBuffer.destroy();

        return resultData;
    }

    private async webGL2Compute(data: Float32Array, shader: string): Promise<Float32Array> {
        const startTime = performance.now();
        try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2');
        if (!gl) {
            this.lastMetrics = {
                executionTime: performance.now() - startTime,
                memoryUsage: 0,
                success: false,
                error: 'WebGL2 not available'
            };
            throw new Error('WebGL2 not available');
        }

        // Simplified WebGL2 compute simulation (actual implementation would use transform feedback or shaders)
        const result = new Float32Array(data.length);
        for (let i = 0; i < data.length; i++) {
            try {
                const fn = new Function('x', `return ${shader.replace('output[index]', 'x')}`);
                result[i] = fn(data[i]);
            } catch (e) {
                console.warn('Shader execution failed, using identity:', e);
                result[i] = data[i];
            }
        }

        return result;
    }

    private async cpuCompute(data: Float32Array, shader: string): Promise<Float32Array> {
        const result = new Float32Array(data.length);
        for (let i = 0; i < data.length; i++) {
            try {
                const fn = new Function('x', `return ${shader.replace('output[index]', 'x')}`);
                result[i] = fn(data[i]);
            } catch (e) {
                console.warn('Shader execution failed on CPU, using identity:', e);
                result[i] = data[i];
            }
        }
        return result;
    }

    public async getDeviceInfo(): Promise<Record<string, unknown>> {
        if (this.device) {
            const adapterInfo = await this.adapter!.requestAdapterInfo();
            return {
                vendor: adapterInfo.vendor,
                architecture: adapterInfo.architecture,
                device: adapterInfo.device,
                description: adapterInfo.description,
                limits: (this.device as any).limits
            };
        } else if (this.fallback) {
            return await this.fallback.getDeviceInfo();
        }
        throw new Error('No compute backend available');
    }

    public getMaxComputeUnits(): number {
        if (this.device) {
            return (this.device as any).limits?.maxComputeWorkgroupsPerDimension ?? 64;
        } else if (this.fallback) {
            return this.fallback.getMaxComputeUnits();
        }
        return 1;
    }

    private recordPerformance(operation: string, duration: number): void {
        const metrics = this.performanceMetrics.get(operation) || [];
        metrics.push(duration);
        if (metrics.length > 100) metrics.shift(); // Keep last 100 measurements
        this.performanceMetrics.set(operation, metrics);
    }

    public getPerformanceMetrics(operation?: string): Record<string, { average: number; max: number; min: number }> {
        const result: Record<string, { average: number; max: number; min: number }> = {};
        if (operation) {
            const metrics = this.performanceMetrics.get(operation) || [];
            if (metrics.length > 0) {
                result[operation] = {
                    average: metrics.reduce((a, b) => a + b, 0) / metrics.length,
                    max: Math.max(...metrics),
                    min: Math.min(...metrics)
                };
            }
        } else {
            for (const [op, metrics] of this.performanceMetrics) {
                if (metrics.length > 0) {
                    result[op] = {
                        average: metrics.reduce((a, b) => a + b, 0) / metrics.length,
                        max: Math.max(...metrics),
                        min: Math.min(...metrics)
                    };
                }
            }
        }
        return result;
    }
}