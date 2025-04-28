import { ComputeNode } from './ComputeNode';

interface ComputeTask {
  size: number;
  data: Float32Array;
  computeShader: string;
}

interface ComputeResult {
  success: boolean;
  result: Float32Array;
  timing?: {
    start: number;
    end: number;
    duration: number;
  };
}

interface WebGL2Context {
  type: 'webgl2';
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  maxComputeUnits: number;
}

interface WebGLContext {
  type: 'webgl';
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  maxComputeUnits: number;
}

interface CPUContext {
  type: 'cpu';
  workers: Worker[];
  maxComputeUnits: number;
}

interface GPUDevice {
    createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer;
    createShaderModule(descriptor: { code: string }): GPUShaderModule;
    createComputePipeline(descriptor: GPUComputePipelineDescriptor): GPUComputePipeline;
    createBindGroup(descriptor: GPUBindGroupDescriptor): GPUBindGroup;
    createCommandEncoder(): GPUCommandEncoder;
    queue: GPUQueue;
}

interface GPUAdapter {
    requestDevice(): Promise<GPUDevice>;
    requestAdapterInfo(): Promise<GPUAdapterInfo>;
}

interface GPUAdapterInfo {
    vendor: string;
    architecture: string;
    device: string;
    description: string;
}

interface GPUBuffer {
    destroy(): void;
    mapAsync(mode: number): Promise<void>;
    getMappedRange(): ArrayBuffer;
    unmap(): void;
}

interface GPUQueue {
    writeBuffer(buffer: GPUBuffer, offset: number, data: ArrayBufferView): void;
    submit(commandBuffers: GPUCommandBuffer[]): void;
}

interface GPUCommandEncoder {
    beginComputePass(): GPUComputePassEncoder;
    copyBufferToBuffer(
        source: GPUBuffer,
        sourceOffset: number,
        destination: GPUBuffer,
        destinationOffset: number,
        size: number
    ): void;
    finish(): GPUCommandBuffer;
}

interface GPUComputePassEncoder {
    setPipeline(pipeline: GPUComputePipeline): void;
    setBindGroup(index: number, bindGroup: GPUBindGroup): void;
    dispatchWorkgroups(x: number, y?: number, z?: number): void;
    end(): void;
}

interface GPUComputePipeline {
    getBindGroupLayout(index: number): GPUBindGroupLayout;
}

interface GPUBindGroupLayout {}

interface GPUBindGroup {}

interface GPUCommandBuffer {}

interface GPUBufferDescriptor {
    size: number;
    usage: number;
}

interface GPUComputePipelineDescriptor {
    layout: 'auto' | GPUPipelineLayout;
    compute: {
        module: GPUShaderModule;
        entryPoint: string;
    };
}

interface GPUBindGroupDescriptor {
    layout: GPUBindGroupLayout;
    entries: {
        binding: number;
        resource: { buffer: GPUBuffer };
    }[];
}

interface GPUShaderModule {}

interface GPUPipelineLayout {}

const GPUBufferUsage = {
    STORAGE: 0x0080,
    COPY_DST: 0x0008,
    COPY_SRC: 0x0004,
    MAP_READ: 0x0001
} as const;

const GPUMapMode = {
    READ: 0x0001
} as const;

type ComputeContext = WebGL2Context | WebGLContext | CPUContext;

interface WebGL2Context {
    type: 'webgl2';
    gl: WebGL2RenderingContext;
}

interface WebGLContext {
    type: 'webgl';
    gl: WebGLRenderingContext;
}

interface CPUContext {
    type: 'cpu';
}

declare global {
    interface WebGL2RenderingContext {
        COMPUTE_SHADER: number;
        SHADER_STORAGE_BUFFER: number;
        SHADER_STORAGE_BARRIER_BIT: number;
        R32F: number;
        RGBA32F: number;
    }

    interface WebGLRenderingContext {
        R32F: number;
        RGBA32F: number;
    }
}

export class GPUCompute {
    private device: GPUDevice | null = null;
    private adapter: GPUAdapter | null = null;
    private context: ComputeContext | null = null;
    private readonly computeNode: ComputeNode;

    constructor(computeNode: ComputeNode) {
        this.computeNode = computeNode;
        void this.initializeGPU().catch((error: unknown) => {
            console.error('Failed to initialize GPU:', error);
            void this.initializeFallback().catch((fallbackError: unknown) => {
                console.error('Failed to initialize fallback:', fallbackError);
                throw new Error('No compute context available');
            });
        });
    }

    private async getDeviceInfo(adapter: GPUAdapter, device: GPUDevice): Promise<Record<string, unknown>> {
        const adapterInfo = await adapter.requestAdapterInfo();
        return {
            vendor: adapterInfo.vendor,
            architecture: adapterInfo.architecture,
            device: adapterInfo.device,
            description: adapterInfo.description,
            limits: (device as any).limits
        };
        const adapterInfo = await adapter.requestAdapterInfo();
        const limits = (device as any).limits;
        return {
            name: adapterInfo.name || 'Unknown',
            vendor: adapterInfo.vendor || 'Unknown',
            maxBufferSize: limits?.maxBufferSize ?? 'unknown',
            maxComputeWorkgroups: limits?.maxComputeWorkgroupsPerDimension ?? 'unknown'
        };
    }

    private getContextCapabilities(context: ComputeContext): Record<string, number> {
        switch (context.type) {
            case 'webgpu':
                return {
                    maxComputeUnits: context.maxComputeUnits,
                    maxBufferSize: (context.device as any).limits?.maxBufferSize ?? 0
                };
            case 'webgl2':
                return {
                    maxComputeUnits: context.maxComputeUnits,
                    maxTextureSize: context.gl.getParameter(context.gl.MAX_TEXTURE_SIZE)
                };
            case 'webgl':
                return {
                    maxComputeUnits: context.maxComputeUnits,
                    maxTextureSize: context.gl.getParameter(context.gl.MAX_TEXTURE_SIZE)
                };
            case 'cpu':
                return {
                    maxComputeUnits: context.maxComputeUnits,
                    maxWorkers: context.workers.length
                };
            default:
                return {
                    maxComputeUnits: 1
                };
        }
        switch (context.type) {
            case 'webgpu':
                return {
                    maxComputeUnits: context.maxComputeUnits,
                    maxBufferSize: (context.device as any).limits?.maxBufferSize ?? 0
                };
            case 'webgl2':
            case 'webgl':
                return {
                    maxComputeUnits: context.maxComputeUnits,
                    maxTextureSize: context.gl.getParameter(context.gl.MAX_TEXTURE_SIZE)
                };
            case 'cpu':
                return {
                    maxComputeUnits: context.maxComputeUnits,
                    maxWorkers: context.workers.length
                };
            default:
                return {
                    maxComputeUnits: 1
                };
        }

        if (context.type === 'webgl2') {
            const gl = context.gl;
            return {
                maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
                maxFragmentUniformVectors: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
                maxComputeUnits: context.maxComputeUnits
            };
        } else if (context.type === 'webgl') {
            const gl = context.gl;
            return {
                maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
                maxFragmentUniformVectors: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
                maxComputeUnits: context.maxComputeUnits
            };
        } else {
            return {
                maxComputeUnits: context.maxComputeUnits
            };
        }
    }

    private async initializeGPU(): Promise<void> {
        try {
            if (!navigator.gpu) {
                throw new Error('WebGPU not supported');
            }

            this.adapter = await navigator.gpu.requestAdapter();
            if (!this.adapter) {
                throw new Error('No GPU adapter found');
            }

            this.device = await this.adapter.requestDevice();
            if (!this.device) {
                throw new Error('Failed to create GPU device');
            }

            this.context = {
                type: 'webgpu',
                device: this.device,
                maxComputeUnits: (this.device as any).limits?.maxComputeWorkgroupsPerDimension ?? 256
            };
        } catch (error) {
            console.error('Failed to initialize WebGPU:', error);
            await this.initializeFallback();
        }
        try {
            // Check if WebGPU is available
            if (!('gpu' in navigator)) {
                throw new Error('WebGPU not supported');
            }

            const gpu = (navigator as any).gpu;
            if (!gpu) {
                throw new Error('WebGPU not available');
            }

            this.adapter = await gpu.requestAdapter({
                powerPreference: 'high-performance'
            });

            if (!this.adapter) {
                throw new Error('No GPU adapter found');
            }

            this.device = await this.adapter.requestDevice();
            if (!this.device) {
                throw new Error('Failed to create GPU device');
            }
            
            // Log GPU capabilities for monitoring
            const info = await this.getDeviceInfo(this.adapter, this.device);
            console.log('GPU Device initialized:', info);
        } catch (error) {
            console.error('GPU initialization failed:', error);
            // Fallback to WebGL or CPU
            this.initializeFallback();
        }
    }

    private async initializeFallback(): Promise<void> {
        try {
            // Try WebGL2 first
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl2');
            if (gl) {
                await this.initializeWebGL2Context(gl);
                return;
            }

            // Try WebGL1 if WebGL2 is not available
            const gl1 = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (gl1) {
                await this.initializeWebGLContext(gl1);
                return;
            }

            await this.initializeCPUContext();
        } catch (error) {
            console.error('Failed to initialize fallback:', error);
            throw new Error('No compute context available');
        }
        try {
            console.log('WebGPU not available, attempting fallback initialization...');
            const canvas = document.createElement('canvas');
            
            // Try WebGL2 first
            const gl2 = canvas.getContext('webgl2', {
                powerPreference: 'high-performance',
                antialias: false, // Disable antialiasing for compute
                depth: false, // No depth buffer needed
                alpha: false // No alpha channel needed
            }) as WebGL2RenderingContext | null;
            
            if (gl2) {
                console.log('Using WebGL2 fallback');
                await this.initializeWebGL2Context(gl2);
                return;
            }

            // Try WebGL if WebGL2 is not available
            const gl1 = canvas.getContext('webgl', {
                powerPreference: 'high-performance',
                antialias: false,
                depth: false,
                alpha: false
            }) as WebGLRenderingContext | null;
            
            if (gl1) {
                console.log('Using WebGL fallback');
                await this.initializeWebGLContext(gl1);
                return;
            }

            // Fall back to CPU if no WebGL support
            console.log('No GPU support detected, falling back to CPU');
            await this.initializeCPUContext();
        } catch (error: unknown) {
            console.error('Error initializing fallback:', error);
            throw new Error('Failed to initialize compute fallback: ' + (error instanceof Error ? error.message : String(error)));
                return;
            }

            // Fall back to CPU as last resort
            console.log('No GPU APIs available, falling back to CPU...');
            this.initializeCPU();
        } catch (error) {
            console.error('Fallback initialization failed:', error);
            // Always ensure we have at least CPU fallback
            this.initializeCPU();
        }
    }

    private async initializeWebGL2Context(gl: WebGL2RenderingContext): Promise<void> {
        const requiredExtensions = ['EXT_color_buffer_float'];
        for (const ext of requiredExtensions) {
            if (!gl.getExtension(ext)) {
                throw new Error(`Required WebGL2 extension ${ext} not available`);
            }
        }

        const computeShader = gl.createShader(gl.COMPUTE_SHADER);
        if (!computeShader) {
            throw new Error('Failed to create compute shader');
        }

        const program = gl.createProgram();
        if (!program) {
            throw new Error('Failed to create WebGL2 program');
        }

        this.context = {
            type: 'webgl2',
            gl,
            program,
            maxComputeUnits: gl.getParameter(gl.MAX_COMPUTE_WORK_GROUP_INVOCATIONS)
        };
        try {
            // Initialize WebGL2 context
            this.context = {
                type: 'webgl2',
                gl,
                program: gl.createProgram()!,
                maxComputeUnits: 1 // Default, will be updated based on hardware
            };

            // Check for compute shader support and required extensions
            const requiredExtensions = ['EXT_color_buffer_float'];
            for (const ext of requiredExtensions) {
                if (!gl.getExtension(ext)) {
                    throw new Error(`Required WebGL2 extension ${ext} not supported`);
                }
            }

            // Create and compile compute shader
            const computeShader = gl.createShader(gl.COMPUTE_SHADER);
            if (!computeShader) {
                throw new Error('Failed to create compute shader');
            }

            gl.shaderSource(computeShader, this.computeNode.getShaderSource());
            gl.compileShader(computeShader);

            if (!gl.getShaderParameter(computeShader, gl.COMPILE_STATUS)) {
                const info = gl.getShaderInfoLog(computeShader);
                gl.deleteShader(computeShader);
                throw new Error('Failed to compile compute shader: ' + info);
            }

            // Attach and link program
            gl.attachShader(this.context.program, computeShader);
            gl.linkProgram(this.context.program);

            if (!gl.getProgramParameter(this.context.program, gl.LINK_STATUS)) {
                const info = gl.getProgramInfoLog(this.context.program);
                throw new Error('Failed to link compute program: ' + info);
            }

            // Clean up
            gl.deleteShader(computeShader);

            // Update compute units based on hardware capabilities
            this.context.maxComputeUnits = gl.getParameter(gl.MAX_COMPUTE_WORK_GROUP_INVOCATIONS) || 1;
                'WEBGL_compute_shader',
                'EXT_color_buffer_float',
                'OES_texture_float'
            ];

            for (const extName of requiredExtensions) {
                const ext = gl.getExtension(extName);
                if (!ext) {
                    console.warn(`Extension ${extName} not supported`);
                    throw new Error(`Required WebGL2 extension ${extName} not available`);
                }
            }

            // Define WebGL2 compute constants if not available
            if (!('COMPUTE_SHADER' in gl)) {
                (gl as any).COMPUTE_SHADER = 0x91B9;
                (gl as any).SHADER_STORAGE_BUFFER = 0x90D2;
                (gl as any).SHADER_STORAGE_BARRIER_BIT = 0x00000100;
                (gl as any).R32F = 0x822E;
                (gl as any).RGBA32F = 0x8814;
            }

        // Initialize WebGL2 compute capabilities
        this.setupWebGL2ComputePipeline(gl);
    }

    private async initializeWebGLContext(gl: WebGLRenderingContext): Promise<void> {
        const program = gl.createProgram();
        if (!program) {
            throw new Error('Failed to create WebGL program');
        }

        this.context = {
            type: 'webgl',
            gl,
            program,
            maxComputeUnits: 1 // WebGL1 doesn't support compute shaders
        };
        // Initialize WebGL1 context
        this.context = {
            type: 'webgl',
            gl,
            program: gl.createProgram()!,
            maxComputeUnits: 1 // Default, will be updated based on hardware
        };

        // Create and compile vertex shader
        const vertexShader = gl.createShader(gl.VERTEX_SHADER);
        if (!vertexShader) {
            throw new Error('Failed to create vertex shader');
        }

        gl.shaderSource(vertexShader, this.computeNode.getVertexShaderSource());
        gl.compileShader(vertexShader);

        if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
            const info = gl.getShaderInfoLog(vertexShader);
            gl.deleteShader(vertexShader);
            throw new Error('Failed to compile vertex shader: ' + info);
        }

        // Create and compile fragment shader
        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
        if (!fragmentShader) {
            throw new Error('Failed to create fragment shader');
        }

        gl.shaderSource(fragmentShader, this.computeNode.getFragmentShaderSource());
        gl.compileShader(fragmentShader);

        if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
            const info = gl.getShaderInfoLog(fragmentShader);
            gl.deleteShader(fragmentShader);
            throw new Error('Failed to compile fragment shader: ' + info);
        }

        // Attach and link program
        gl.attachShader(this.context.program, vertexShader);
        gl.attachShader(this.context.program, fragmentShader);
        gl.linkProgram(this.context.program);

        if (!gl.getProgramParameter(this.context.program, gl.LINK_STATUS)) {
            const info = gl.getProgramInfoLog(this.context.program);
            throw new Error('Failed to link program: ' + info);
        }

        // Clean up
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);

        // Update compute units based on hardware capabilities
        this.context.maxComputeUnits = Math.min(
            gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS),
            gl.getParameter(gl.MAX_TEXTURE_SIZE)
        ) || 1;
        // Basic WebGL initialization
        const vertexShader = gl.createShader(gl.VERTEX_SHADER);
        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
        
        if (!vertexShader || !fragmentShader) {
            throw new Error('Failed to create WebGL shaders');
        }

        // Setup basic rendering pipeline
        this.setupWebGLComputePipeline(gl, vertexShader, fragmentShader);
    }

    private initializeCPU(): void {
        console.log('Using CPU fallback for compute operations');
        // Setup Web Workers for CPU computation
        const workerCount = navigator.hardwareConcurrency || 4;
        this.setupCPUComputePipeline(workerCount);
    }

    private setupWebGL2ComputePipeline(gl: WebGL2RenderingContext): void {
        // Setup compute pipeline using WebGL2 features
        const computeProgram = gl.createProgram();
        if (!computeProgram) {
            throw new Error('Failed to create WebGL2 compute program');
        }

        // Store context for compute operations
        this.context = {
            type: 'webgl2',
            gl,
            program: computeProgram,
            maxComputeUnits: this.getMaxComputeUnits(gl)
        };
    }

    private setupWebGLComputePipeline(gl: WebGLRenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader): void {
        // Setup basic WebGL pipeline for compute simulation
        const program = gl.createProgram();
        if (!program) {
            throw new Error('Failed to create WebGL program');
        }

        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        this.context = {
            type: 'webgl',
            gl,
            program,
            maxComputeUnits: 1 // Limited compute capabilities
        };
    }

    private setupCPUComputePipeline(workerCount: number): void {
        // Initialize Web Workers for CPU-based parallel computing
        const workers = new Array(workerCount).fill(null).map(() => 
            new Worker(new URL('../workers/compute.worker.ts', import.meta.url))
        );

        this.context = {
            type: 'cpu',
            workers,
            maxComputeUnits: workerCount
        };
    }

    private getMaxComputeUnits(gl: WebGL2RenderingContext): number {
        const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        const maxComputeWorkGroupSize = 256; // Standard size
        return Math.floor(maxTextureSize / maxComputeWorkGroupSize);
    }

    async computeTask(task: ComputeTask): Promise<ComputeResult> {
        if (!this.context) {
            throw new Error('Compute context not initialized');
        }

        switch (this.context.type) {
            case 'webgl2':
                return this.computeWithWebGL2(task);
            case 'webgl':
                return this.computeWithWebGL(task);
            case 'cpu':
                return this.computeWithCPU(task);
            default:
                throw new Error('Invalid compute context');
        }
    }

    private async computeWithWebGL2(task: ComputeTask): Promise<ComputeResult> {
        if (!this.context || this.context.type !== 'webgl2') {
            throw new Error('WebGL2 context not initialized');
        }
        const { gl, program } = this.context;
        
        // Create buffers
        const inputBuffer = gl.createBuffer();
        if (!inputBuffer) {
            throw new Error('Failed to create WebGL buffer');
        const outputBuffer = gl.createBuffer();
        
        if (!inputBuffer || !outputBuffer) {
            throw new Error('Failed to create WebGL2 buffers');
        }

        // Bind and upload input data
        gl.bindBuffer(gl.ARRAY_BUFFER, inputBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, task.data, gl.STATIC_DRAW);

        // Setup compute shader
        const computeShader = gl.createShader(gl.COMPUTE_SHADER);
        if (!computeShader) {
            throw new Error('Failed to create compute shader');
        }

        gl.shaderSource(computeShader, `#version 310 es
            layout(local_size_x = 256) in;
            layout(std430) buffer;
            layout(binding = 0) readonly buffer Input { float data[]; } input_data;
            layout(binding = 1) buffer Output { float data[]; } output_data;
            
            void main() {
                uint index = gl_GlobalInvocationID.x;
                if (index >= ${task.size}) return;
                output_data.data[index] = input_data.data[index] * 2.0; // Example computation
            }
        `);

        gl.compileShader(computeShader);
        gl.attachShader(program, computeShader);
        gl.linkProgram(program);
        gl.useProgram(program);

        // Dispatch compute
        const workGroupSize = 256;
        const numGroups = Math.ceil(task.size / workGroupSize);
        gl.dispatchCompute(numGroups, 1, 1);
        gl.memoryBarrier(gl.SHADER_STORAGE_BARRIER_BIT);

        // Read results
        const result = new Float32Array(task.size);
        gl.getBufferSubData(gl.SHADER_STORAGE_BUFFER, 0, result);

        // Cleanup
        gl.deleteBuffer(inputBuffer);
        gl.deleteBuffer(outputBuffer);
        gl.deleteShader(computeShader);

        return { success: true, result };
    }

    private async computeWithWebGL(task: ComputeTask): Promise<ComputeResult> {
        const { gl, program } = this.context as WebGLContext;
        
        // Create texture for input data
        const inputTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, inputTexture);
        
        // Calculate texture dimensions
        const width = Math.ceil(Math.sqrt(task.size));
        const height = Math.ceil(task.size / width);
        
        // Upload data to texture
        const paddedData = new Float32Array(width * height);
        paddedData.set(task.data);
        
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA32F,
            width,
            height,
            0,
            gl.RGBA,
            gl.FLOAT,
            paddedData
        );
        
        // Create framebuffer for output
        const framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        
        // Create output texture
        const outputTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, outputTexture);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA32F,
            width,
            height,
            0,
            gl.RGBA,
            gl.FLOAT,
            null
        );
        
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D,
            outputTexture,
            0
        );
        
        // Run computation
        gl.useProgram(program);
        gl.viewport(0, 0, width, height);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        
        // Read results
        const result = new Float32Array(task.size);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, result);
        
        // Cleanup
        gl.deleteTexture(inputTexture);
        gl.deleteTexture(outputTexture);
        gl.deleteFramebuffer(framebuffer);
        
        return { success: true, result: result.slice(0, task.size) };
    }

    private async computeWithCPU(task: ComputeTask): Promise<ComputeResult> {
        if (!this.context || this.context.type !== 'cpu') {
            throw new Error('CPU context not initialized');
        }

        const { workers } = this.context;
        const chunkSize = Math.ceil(task.data.length / workers.length);
        const promises: Promise<Float32Array>[] = [];

        for (let i = 0; i < workers.length; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, task.data.length);
            const chunk = task.data.slice(start, end);
            
            promises.push(new Promise<Float32Array>((resolve, reject) => {
                const worker = workers[i];
                worker.onmessage = (e: MessageEvent) => resolve(new Float32Array(e.data));
                worker.onerror = (e: ErrorEvent) => reject(e);
                worker.postMessage({
                    data: chunk,
                    computeShader: task.computeShader
                });
            }));
        }

        try {
            const results = await Promise.all(promises);
            const finalResult = new Float32Array(task.data.length);
            let offset = 0;
            
            for (const result of results) {
                finalResult.set(result, offset);
                offset += result.length;
            }

            return {
                success: true,
                result: finalResult
            };
        } catch (error: unknown) {
            console.error('CPU computation failed:', error);
            return {
                success: false,
                result: new Float32Array()
            };
        }
        if (!this.context || this.context.type !== 'cpu') {
            throw new Error('CPU context not initialized');
        }

        const { workers } = this.context;
        const chunkSize = Math.ceil(task.data.length / workers.length);
        const promises: Promise<Float32Array>[] = [];

        // Split task among workers
        for (let i = 0; i < workers.length; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, task.data.length);
            const chunk = task.data.slice(start, end);

            promises.push(
                new Promise((resolve, reject) => {
                    const worker = workers[i];
                    worker.onmessage = (e) => resolve(new Float32Array(e.data));
                    worker.onerror = (e) => reject(e);
                    worker.postMessage({
                        data: chunk,
                        computeShader: task.computeShader
                    });
                })
            );
        }

        try {
            // Wait for all workers to complete
            const results = await Promise.all(promises);
            
            // Combine results
            const finalResult = new Float32Array(task.data.length);
            let offset = 0;
            for (const result of results) {
                finalResult.set(result, offset);
                offset += result.length;
            }

            return {
                success: true,
                result: finalResult
            };
        } catch (error) {
            console.error('CPU computation failed:', error);
            return {
                success: false,
                result: new Float32Array(0)
            };
        }
        const promises = workers.map((worker, index) => 
            new Promise<Float32Array>((resolve) => {
                worker.onmessage = (e) => resolve(e.data);
                worker.postMessage({
                    start: index * chunkSize,
                    end: Math.min((index + 1) * chunkSize, task.size),
                    data: task.data
                });
            })
        );

        const results = await Promise.all(promises);
        const finalResult = new Float32Array(task.size);
        results.forEach((chunk, index) => {
            finalResult.set(chunk, index * chunkSize);
        });

        return { success: true, result: finalResult };
    }
            console.error('WebGL not supported, falling back to CPU');
            return;
        }

        // Store WebGL context for fallback computations
        this.context = gl;
    }

    async executeTask(taskId: string, computeShader: string, inputs: Float32Array): Promise<Float32Array> {
        if (this.device) {
            return this.executeGPUTask(computeShader, inputs);
        } else if (this.context) {
            return this.executeWebGLTask(computeShader, inputs);
        } else {
            return this.executeCPUTask(inputs);
        }
    }

    private async executeGPUTask(computeShader: string, inputs: Float32Array): Promise<Float32Array> {
        if (!this.device) {
            throw new Error('WebGPU device not initialized');
        }

        try {
            const device = this.device;

            // Create input buffer
            const inputBuffer = device.createBuffer({
                size: inputs.byteLength,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });

            // Create output buffer
            const outputBuffer = device.createBuffer({
                size: inputs.byteLength,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
            });

            // Write input data
            device.queue.writeBuffer(inputBuffer, 0, inputs);

            // Create compute pipeline
            const pipeline = device.createComputePipeline({
                layout: 'auto',
                compute: {
                    module: device.createShaderModule({
                        code: computeShader,
                    }),
                    entryPoint: 'main',
                },
            });

            // Create bind group
            const bindGroup = device.createBindGroup({
                layout: pipeline.getBindGroupLayout(0),
                entries: [
                    {
                        binding: 0,
                        resource: { buffer: inputBuffer },
                    },
                    {
                        binding: 1,
                        resource: { buffer: outputBuffer },
                    },
                ],
            });

            // Create command encoder
            const commandEncoder = device.createCommandEncoder();
            const passEncoder = commandEncoder.beginComputePass();
            passEncoder.setPipeline(pipeline);
            passEncoder.setBindGroup(0, bindGroup);
            passEncoder.dispatchWorkgroups(Math.ceil(inputs.length / 64));
            passEncoder.end();

            // Get result
            const readbackBuffer = device.createBuffer({
                size: inputs.byteLength,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            });

            commandEncoder.copyBufferToBuffer(
                outputBuffer,
                0,
                readbackBuffer,
                0,
                inputs.byteLength
            );

            device.queue.submit([commandEncoder.finish()]);

            await readbackBuffer.mapAsync(GPUMapMode.READ);
            const result = new Float32Array(readbackBuffer.getMappedRange());
            readbackBuffer.unmap();

            // Cleanup
            inputBuffer.destroy();
            outputBuffer.destroy();
            readbackBuffer.destroy();

            return result;
        } catch (error) {
            console.error('GPU task execution failed:', error);
            // Fall back to WebGL2 if available
            if (this.context?.type === 'webgl2') {
                return this.executeWebGLTask(computeShader, inputs);
            }
            // Otherwise fall back to CPU
            return this.executeCPUTask(inputs);
        }
    }

    private async executeWebGLTask(shader: string, inputs: Float32Array): Promise<Float32Array> {
        if (!this.context) {
            throw new Error('No compute context available');
        }

        try {
            if (this.context.type !== 'webgl2') {
                throw new Error('WebGL2 context required for compute tasks');
            }

            const context = this.context;
            const gl = context.gl;
            
            // Create and compile compute shader
            const computeShader = gl.createShader(gl.COMPUTE_SHADER);
            if (!computeShader) throw new Error('Failed to create compute shader');
            
            gl.shaderSource(vertexShader, `#version 300 es
                in vec4 position;
                void main() {
                    gl_Position = position;
                }
            `);
            gl.compileShader(vertexShader);
            
            if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
                throw new Error(`Vertex shader compilation failed: ${gl.getShaderInfoLog(vertexShader)}`);
            }

            // Create and compile fragment shader
            const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
            if (!fragmentShader) throw new Error('Failed to create fragment shader');
            
            gl.shaderSource(fragmentShader, shader);
            gl.compileShader(fragmentShader);
            
            if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
                throw new Error(`Fragment shader compilation failed: ${gl.getShaderInfoLog(fragmentShader)}`);
            }

            // Create and link program
            const program = gl.createProgram();
            if (!program) throw new Error('Failed to create shader program');
            
            gl.attachShader(program, vertexShader);
            gl.attachShader(program, fragmentShader);
            gl.linkProgram(program);
            
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                throw new Error(`Program linking failed: ${gl.getProgramInfoLog(program)}`);
            }
            
            gl.useProgram(program);

            // Create and setup input texture with optimal parameters
            const texture = gl.createTexture();
            if (!texture) throw new Error('Failed to create texture');
            
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            
            gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                gl.R32F,
                inputs.length,
                1,
                0,
                gl.RED,
                gl.FLOAT,
                inputs
            );

            // Create and setup framebuffer
            const framebuffer = gl.createFramebuffer();
            if (!framebuffer) throw new Error('Failed to create framebuffer');
            
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
            
            if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
                throw new Error('Framebuffer is incomplete');
            }

            // Read result with error checking
            const result = new Float32Array(inputs.length);
            gl.readPixels(0, 0, inputs.length, 1, gl.RED, gl.FLOAT, result);
            
            if (gl.getError() !== gl.NO_ERROR) {
                throw new Error('Error reading pixel data');
            }

            // Cleanup
            gl.deleteShader(vertexShader);
            gl.deleteShader(fragmentShader);
            gl.deleteProgram(program);
            gl.deleteTexture(texture);
            gl.deleteFramebuffer(framebuffer);

            return result;
        } catch (error) {
            console.error('WebGL task execution failed:', error);
            // Fall back to CPU computation if WebGL fails
            return this.executeCPUTask(inputs);
        }
    }

    private async executeCPUTask(inputs: Float32Array): Promise<Float32Array> {
        // Simple CPU fallback for basic operations
        return inputs.map(x => x * 2);
    }

    async getDeviceInfo(): Promise<{
        type: 'webgpu' | 'webgl' | 'cpu';
        capabilities: any;
    }> {
        if (this.device) {
            return {
                type: 'webgpu',
                capabilities: {
                    maxBufferSize: this.device.limits.maxBufferSize,
                    maxComputeWorkgroupsPerDimension: this.device.limits.maxComputeWorkgroupsPerDimension,
                }
            };
        } else if (this.context) {
            if (!this.context) {
                throw new Error('Context not initialized');
            }
            const contextType = this.context.type;
            const capabilities = this.getContextCapabilities(this.context);
            return {
                type: contextType,
                capabilities,
                    maxFragmentUniformVectors: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
                }
            };
        }
        
        return {
            type: 'cpu',
            capabilities: {
                threads: navigator.hardwareConcurrency
            }
        };
    }
}
