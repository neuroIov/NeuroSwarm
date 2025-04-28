import { GPUDeviceDescriptor } from '@webgpu/types';

export class ComputeService {
    private device: GPUDevice | null = null;
    private queue: GPUQueue | null = null;
    private webglContext: WebGLRenderingContext | null = null;
    private isWebGPUSupported: boolean = false;

    constructor() {
        this.initializeCompute();
    }

    private async initializeCompute(): Promise<void> {
        try {
            // Try WebGPU first
            if ('gpu' in navigator) {
                const adapter = await navigator.gpu.requestAdapter();
                if (adapter) {
                    const deviceDesc: GPUDeviceDescriptor = {
                        requiredFeatures: ['shader-f32'],
                        requiredLimits: {
                            maxStorageBufferBindingSize: 128 * 1024 * 1024, // 128MB
                            maxBufferSize: 256 * 1024 * 1024 // 256MB
                        }
                    };
                    this.device = await adapter.requestDevice(deviceDesc);
                    this.queue = this.device.queue;
                    this.isWebGPUSupported = true;
                    console.log('WebGPU initialized successfully');
                    return;
                }
            }

            // Fallback to WebGL
            const canvas = document.createElement('canvas');
            this.webglContext = canvas.getContext('webgl2');
            if (!this.webglContext) {
                throw new Error('Neither WebGPU nor WebGL2 is supported');
            }
            console.log('Falling back to WebGL2');
        } catch (error) {
            console.error('Compute initialization failed:', error);
            throw error;
        }
    }

    async executeTask(shader: string, input: Float32Array): Promise<Float32Array> {
        if (this.isWebGPUSupported) {
            return this.executeWebGPUTask(shader, input);
        } else if (this.webglContext) {
            return this.executeWebGLTask(shader, input);
        }
        throw new Error('No compute backend available');
    }

    private async executeWebGPUTask(computeShader: string, inputs: Float32Array): Promise<Float32Array> {
        if (!this.device || !this.queue) {
            throw new Error('WebGPU not initialized');
        }

        try {
            // Create input buffer
            const inputBuffer = this.device.createBuffer({
                size: inputs.byteLength,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
                mappedAtCreation: true
            });
            new Float32Array(inputBuffer.getMappedRange()).set(inputs);
            inputBuffer.unmap();

            // Create output buffer
            const outputBuffer = this.device.createBuffer({
                size: inputs.byteLength,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
                mappedAtCreation: false
            });

            // Create shader module
            const shaderModule = this.device.createShaderModule({
                code: computeShader
            });

            // Create pipeline
            const pipeline = this.device.createComputePipeline({
                layout: 'auto',
                compute: {
                    module: shaderModule,
                    entryPoint: 'main'
                }
            });

            // Create bind group
            const bindGroup = this.device.createBindGroup({
                layout: pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: inputBuffer } },
                    { binding: 1, resource: { buffer: outputBuffer } }
                ]
            });

            // Create command encoder
            const commandEncoder = this.device.createCommandEncoder();
            const passEncoder = commandEncoder.beginComputePass();
            passEncoder.setPipeline(pipeline);
            passEncoder.setBindGroup(0, bindGroup);
            passEncoder.dispatchWorkgroups(Math.ceil(inputs.length / 64));
            passEncoder.end();

            // Get result
            const resultBuffer = this.device.createBuffer({
                size: inputs.byteLength,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
            });
            commandEncoder.copyBufferToBuffer(outputBuffer, 0, resultBuffer, 0, inputs.byteLength);

            // Submit commands
            this.queue.submit([commandEncoder.finish()]);

            // Read result
            await resultBuffer.mapAsync(GPUMapMode.READ);
            const result = new Float32Array(resultBuffer.getMappedRange().slice(0));
            resultBuffer.unmap();

            return result;
        } catch (error) {
            console.error('WebGPU task execution failed:', error);
            throw error;
        }
    }

    private async executeWebGLTask(shader: string, inputs: Float32Array): Promise<Float32Array> {
        if (!this.webglContext) {
            throw new Error('WebGL not initialized');
        }

        try {
            const gl = this.webglContext;

            // Create vertex shader (passthrough)
            const vertexShader = gl.createShader(gl.VERTEX_SHADER)!;
            gl.shaderSource(vertexShader, `
                attribute vec4 position;
                void main() {
                    gl_Position = position;
                }
            `);
            gl.compileShader(vertexShader);

            // Create fragment shader (compute)
            const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)!;
            gl.shaderSource(fragmentShader, shader);
            gl.compileShader(fragmentShader);

            // Create program
            const program = gl.createProgram()!;
            gl.attachShader(program, vertexShader);
            gl.attachShader(program, fragmentShader);
            gl.linkProgram(program);
            gl.useProgram(program);

            // Create texture for input data
            const inputTexture = gl.createTexture()!;
            gl.bindTexture(gl.TEXTURE_2D, inputTexture);
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

            // Create framebuffer for output
            const framebuffer = gl.createFramebuffer()!;
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

            // Create output texture
            const outputTexture = gl.createTexture()!;
            gl.bindTexture(gl.TEXTURE_2D, outputTexture);
            gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                gl.R32F,
                inputs.length,
                1,
                0,
                gl.RED,
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

            // Draw
            gl.viewport(0, 0, inputs.length, 1);
            gl.drawArrays(gl.TRIANGLES, 0, 3);

            // Read result
            const result = new Float32Array(inputs.length);
            gl.readPixels(0, 0, inputs.length, 1, gl.RED, gl.FLOAT, result);

            // Cleanup
            gl.deleteTexture(inputTexture);
            gl.deleteTexture(outputTexture);
            gl.deleteFramebuffer(framebuffer);
            gl.deleteProgram(program);
            gl.deleteShader(vertexShader);
            gl.deleteShader(fragmentShader);

            return result;
        } catch (error) {
            console.error('WebGL task execution failed:', error);
            throw error;
        }
    }

    getBackendInfo(): { type: 'webgpu' | 'webgl' | 'none'; limits?: any } {
        if (this.isWebGPUSupported && this.device) {
            return {
                type: 'webgpu',
                limits: this.device.limits
            };
        } else if (this.webglContext) {
            return {
                type: 'webgl',
                limits: {
                    maxTextureSize: this.webglContext.getParameter(this.webglContext.MAX_TEXTURE_SIZE),
                    maxComputeWorkgroupSize: 1024
                }
            };
        }
        return { type: 'none' };
    }
}
