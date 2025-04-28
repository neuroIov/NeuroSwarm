declare global {
    interface Navigator {
        gpu: GPU;
    }

    interface GPU {
        requestAdapter(options?: GPURequestAdapterOptions): Promise<GPUAdapter | null>;
    }

    interface GPURequestAdapterOptions {
        powerPreference?: 'low-power' | 'high-performance';
    }

    interface GPUAdapter {
        name: string;
        requestDevice(descriptor?: GPUDeviceDescriptor): Promise<GPUDevice>;
    }

    interface GPUDevice {
        limits: {
            maxBufferSize: number;
            maxComputeWorkgroupsPerDimension: number;
        };
        createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer;
        createShaderModule(descriptor: GPUShaderModuleDescriptor): GPUShaderModule;
        createComputePipeline(descriptor: GPUComputePipelineDescriptor): GPUComputePipeline;
        createBindGroup(descriptor: GPUBindGroupDescriptor): GPUBindGroup;
        createCommandEncoder(): GPUCommandEncoder;
        queue: GPUQueue;
    }

    interface GPUBuffer {
        mapAsync(mode: number): Promise<void>;
        getMappedRange(): ArrayBuffer;
        unmap(): void;
    }

    interface GPUBufferDescriptor {
        size: number;
        usage: number;
    }

    interface GPUShaderModuleDescriptor {
        code: string;
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
        entries: GPUBindGroupEntry[];
    }

    interface GPUBindGroupEntry {
        binding: number;
        resource: { buffer: GPUBuffer } | GPUSampler | GPUTextureView;
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

    interface GPUQueue {
        writeBuffer(buffer: GPUBuffer, offset: number, data: ArrayBuffer | ArrayBufferView): void;
        submit(commandBuffers: GPUCommandBuffer[]): void;
    }

    const GPUBufferUsage: {
        STORAGE: number;
        COPY_SRC: number;
        COPY_DST: number;
        MAP_READ: number;
    };

    const GPUMapMode: {
        READ: number;
    };
}
